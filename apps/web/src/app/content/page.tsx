'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, FormEvent } from 'react';
import {
  api,
  ApiError,
  CurriculumOverview,
  homeFor,
  Me,
  UnitContents,
} from '@/lib/api';
import { TeacherHeader } from '@/components/TeacherShell';
import { Icon } from '@/components/Icon';
import { Facts } from '@/components/Facts';
import { canPublish, DraftNote, ReviewAndPublish, UnitState } from '@/components/Lifecycle';

/**
 * The curriculum, as the teacher manages it.
 *
 * The screen answers two questions before anything else: what is in this
 * course, and what is not finished. Every count comes from stored rows, so a
 * unit that says it has no test questions has none — and a unit that draws its
 * test from its practice questions says so, because the platform does that and
 * a teacher reading "0" would otherwise think her test was broken.
 *
 * Nothing here writes teaching content of its own. The teacher enters it and
 * approves it (SRS 32, 37.7).
 */
export default function ContentPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [overview, setOverview] = useState<CurriculumOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<UnitContents | null>(null);

  const load = useCallback(async () => {
    try {
      setOverview(await api.get<CurriculumOverview>('/content/overview'));
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.push('/login');
        return;
      }
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'The curriculum could not be loaded. Check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then((user) => {
        if (user.role === 'STUDENT' || user.mustChangePassword) {
          router.replace(homeFor(user));
          return;
        }
        setMe(user);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  async function hide(unit: UnitContents) {
    setBusyId(unit.id);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/content/units/${unit.id}/status`, { status: 'DRAFT' });
      setNotice(`${unit.title} is hidden from students. Its published items stay published and reappear when you open it again.`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That could not be changed.');
    } finally {
      setBusyId(null);
    }
  }

  if (!me) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const counting = overview?.units.filter((u) => u.countsTowardCompletion) ?? [];
  const extra = overview?.units.filter((u) => !u.countsTowardCompletion) ?? [];
  const open = counting.filter((u) => u.status === 'PUBLISHED').length;
  const words = (overview?.units ?? []).reduce((sum, u) => sum + u.vocabulary.total, 0);
  const questions = (overview?.units ?? []).reduce(
    (sum, u) => sum + u.activity.total + u.assessment.total,
    0,
  );

  return (
    <>
      <TeacherHeader me={me} />
      <main className="page teacher-page stack">
        <div className="pagehead">
          <h1>{overview?.course.title ?? 'Curriculum'}</h1>
          <p className="muted">
            {overview
              ? `${counting.length} course ${counting.length === 1 ? 'unit' : 'units'}, ${open} open to students`
              : 'Loading…'}
          </p>
          {/* The course in figures, from the same counts the rows show. */}
          {overview && overview.units.length > 0 && (
            <Facts
              items={[
                { value: counting.length, label: counting.length === 1 ? 'course unit' : 'course units' },
                {
                  value: open,
                  label: 'open to students',
                  tone: open === 0 ? 'warn' : open === counting.length ? 'ok' : undefined,
                },
                { value: words, label: 'words' },
                { value: questions, label: 'questions' },
              ]}
            />
          )}
        </div>

        {error && (
          <p className="alert error" role="alert">
            {error}{' '}
            <button className="small" onClick={() => void load()}>
              Try again
            </button>
          </p>
        )}
        {notice && (
          <p className="alert ok" role="status">
            {notice}
          </p>
        )}

        <DraftNote me={me} unitOpen={false} />

        {canPublish(me) && (
          <p className="alert warn">
            A student sees an item only when the item is published <em>and</em> its unit is
            visible. In a visible unit, <strong>a change to a published item is live straight
            away</strong> — hide the unit first to work on it privately.
          </p>
        )}

        {reviewing && (
          <ReviewAndPublish
            me={me}
            unitId={reviewing.id}
            unitTitle={reviewing.title}
            onCancel={() => setReviewing(null)}
            onError={(message) => {
              setError(message);
              setReviewing(null);
            }}
            onDone={async (message) => {
              setReviewing(null);
              setNotice(message);
              await load();
            }}
          />
        )}

        <AddUnitForm
          onAdded={(title) => {
            setNotice(
              canPublish(me)
                ? `${title} was added as a draft. It is hidden from students until you review and publish it.`
                : `${title} was added as a draft. Students cannot see it; a teacher publishes it when it is ready.`,
            );
            void load();
          }}
          onError={setError}
        />

        {loading ? (
          <p className="muted">Loading…</p>
        ) : !overview ? null : overview.units.length === 0 ? (
          <div className="panel">
            <div className="panel-body">
              <p className="note-line">
                This course has no units yet. Add the first one above, then fill in its
                vocabulary, grammar, activity and test.
              </p>
            </div>
          </div>
        ) : (
          <>
            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Course units</h2>
                <span className="panel-note">These count towards the course</span>
              </div>
              {counting.length === 0 ? (
                <div className="panel-body">
                  <p className="note-line">No unit counts towards the course yet.</p>
                </div>
              ) : (
                <ul className="unitlist">
                  {counting.map((unit) => (
                    <UnitRow
                      key={unit.id}
                      unit={unit}
                      busy={busyId === unit.id}
                      me={me}
                      onOpen={() => router.push(`/content/${unit.id}`)}
                      onPublish={() => setReviewing(unit)}
                      onHide={() => hide(unit)}
                    />
                  ))}
                </ul>
              )}
            </section>

            {extra.length > 0 && (
              <section className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">Extra practice</h2>
                  <span className="panel-note">Offered to students, not counted</span>
                </div>
                <ul className="unitlist">
                  {extra.map((unit) => (
                    <UnitRow
                      key={unit.id}
                      unit={unit}
                      busy={busyId === unit.id}
                      me={me}
                      onOpen={() => router.push(`/content/${unit.id}`)}
                      onPublish={() => setReviewing(unit)}
                      onHide={() => hide(unit)}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}

/** What a teacher still has to do to this unit, in her words, from real counts. */
export function unfinished(unit: UnitContents): string[] {
  const todo: string[] = [];
  const { vocabulary, grammar, activity, testPool } = unit;

  if (vocabulary.total === 0) todo.push('No words yet');
  else if (vocabulary.missingMeaning > 0)
    todo.push(
      `${vocabulary.missingMeaning} ${vocabulary.missingMeaning === 1 ? 'word has' : 'words have'} no Arabic meaning`,
    );

  if (grammar.sections === 0) todo.push('No grammar page yet');
  else if (grammar.withContent === 0) todo.push('The grammar page is empty');

  if (activity.total === 0) todo.push('No activity questions yet');
  else if (activity.asked === 0) todo.push('No activity question is ready for students');

  if (testPool.available === 0) todo.push('Nothing for the test to ask');

  const flagged = unit.questionsNeedingReview + unit.sectionsNeedingReview;
  if (flagged > 0)
    todo.push(`${flagged} ${flagged === 1 ? 'item needs' : 'items need'} your review`);

  return todo;
}

/**
 * One unit: what it holds, and whether students can reach it.
 *
 * The four chips are the order a student meets them in, which is also the
 * order the unit editor puts them in — so the shape a teacher learns here is
 * the shape she edits.
 */
function UnitRow({
  unit,
  busy,
  me,
  onOpen,
  onPublish,
  onHide,
}: {
  unit: UnitContents;
  busy: boolean;
  me: Me;
  onOpen: () => void;
  onPublish: () => void;
  onHide: () => void;
}) {
  const todo = unfinished(unit);
  const live = unit.status === 'PUBLISHED';

  // Ready is quiet and a gap is loud, so the eye lands on the unit that needs
  // work rather than on four green chips per row saying everything is fine.
  const parts: { label: string; state: 'ready' | 'gap' | 'empty' }[] = [
    {
      label:
        unit.vocabulary.total === 0
          ? 'No words'
          : `${unit.vocabulary.total} ${unit.vocabulary.total === 1 ? 'word' : 'words'}`,
      state:
        unit.vocabulary.total === 0
          ? 'empty'
          : unit.vocabulary.missingMeaning > 0
            ? 'gap'
            : 'ready',
    },
    {
      label: unit.grammar.sections === 0 ? 'No grammar' : 'Grammar',
      state:
        unit.grammar.sections === 0 ? 'empty' : unit.grammar.withContent === 0 ? 'gap' : 'ready',
    },
    {
      label:
        unit.activity.total === 0
          ? 'No activity'
          : `Activity ${unit.activity.asked}/${unit.activity.total}`,
      state: unit.activity.total === 0 ? 'empty' : unit.activity.asked === 0 ? 'gap' : 'ready',
    },
    {
      label:
        unit.testPool.available === 0
          ? 'No test'
          : unit.testPool.source === 'assessment'
            ? `Test ${unit.assessment.asked}`
            : 'Test from activity',
      state: unit.testPool.available === 0 ? 'empty' : 'ready',
    },
  ];

  return (
    <li className="unitrow" data-live={live}>
      <div className="unitrow-main">
        <div className="unitrow-id">
          <button className="unitrow-open" onClick={onOpen}>
            {unit.title}
            <Icon name="back" />
          </button>
          <UnitState status={unit.status} />
        </div>
        <div className="parts">
          {parts.map((part) => (
            <span key={part.label} className="part" data-state={part.state}>
              {part.label}
            </span>
          ))}
        </div>
      </div>

      {todo.length > 0 && (
        <ul className="unitrow-todo" aria-label="Still to do">
          {todo.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      <div className="unitrow-do">
        {/* A teacher's controls. An administrator reads the state and asks. */}
        {canPublish(me) ? (
          <>
            <button className="small" disabled={busy} onClick={onPublish} data-testid="review-unit">
              {live ? 'Publish drafts…' : 'Review and publish…'}
            </button>
            {live && (
              <button className="small" disabled={busy} onClick={onHide} data-testid="hide-unit">
                {busy ? 'Working…' : 'Hide from students'}
              </button>
            )}
          </>
        ) : (
          <span className="muted" style={{ fontSize: 'var(--fs-caption)' }}>
            A teacher publishes this unit
          </span>
        )}
      </div>
    </li>
  );
}

function AddUnitForm({
  onAdded,
  onError,
}: {
  onAdded: (title: string) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post('/content/units', { title, ...(kind.trim() ? { kind: kind.trim() } : {}) });
      onAdded(title);
      setTitle('');
      setKind('');
      setOpen(false);
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'The unit could not be added.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div>
        <button className="primary" onClick={() => setOpen(true)}>
          Add a unit
        </button>
      </div>
    );
  }

  return (
    <form className="panel" onSubmit={submit} noValidate>
      <div className="panel-head">
        <h2 className="panel-title">Add a unit</h2>
      </div>
      <div className="panel-body stack">
        <div>
          <label htmlFor="unitTitle">Title</label>
          <input id="unitTitle" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </div>

        <div>
          <label htmlFor="unitKind">Kind (optional)</label>
          <input id="unitKind" value={kind} onChange={(e) => setKind(e.target.value)} />
          <p className="muted">
            Leave this empty for a normal unit. Use it to mark material that is not one, such as
            &ldquo;Welcome&rdquo; or &ldquo;Review&rdquo;.
          </p>
        </div>

        <div className="row">
          <button className="primary" type="submit" disabled={busy || title.trim() === ''}>
            {busy ? 'Adding…' : 'Add unit'}
          </button>
          <button type="button" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
