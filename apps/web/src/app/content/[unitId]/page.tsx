'use client';

import { useParams, useRouter } from 'next/navigation';
import { Fragment, useCallback, useEffect, useState, FormEvent } from 'react';
import {
  api,
  ApiError,
  apiUrl,
  AssessmentRules,
  CurriculumOverview,
  homeFor,
  Me,
  PresentedQuestion,
  Section,
  SectionType,
  UnitContents,
  UnitDetail,
  VocabularyItem,
} from '@/lib/api';
import { QuestionList } from '@/components/QuestionList';
import { TeacherHeader } from '@/components/TeacherShell';
import { Icon } from '@/components/Icon';
import { unfinished } from '../page';

type Tab = 'vocabulary' | 'grammar' | 'activities' | 'assessment';

/**
 * One unit, in the order a student meets it: words, then grammar, then the
 * activity, then the test.
 *
 * The order is the point. It is the sequence the platform unlocks in and the
 * sequence the class and student screens report against, so a teacher who
 * learns it once knows where she is everywhere. Splitting the parts also means
 * preparing a word list does not involve scrolling past every question.
 */
export default function UnitPage() {
  const router = useRouter();
  const params = useParams<{ unitId: string }>();
  const unitId = params.unitId;

  const [me, setMe] = useState<Me | null>(null);
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [contents, setContents] = useState<UnitContents | null>(null);
  const [types, setTypes] = useState<SectionType[]>([]);
  const [rules, setRules] = useState<AssessmentRules | null>(null);
  const [rulesFailed, setRulesFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>('vocabulary');

  const load = useCallback(async () => {
    try {
      // The overview is asked for the same counts the Curriculum screen shows,
      // so the two cannot disagree about what this unit holds.
      const [detail, sectionTypes, overview] = await Promise.all([
        api.get<UnitDetail>(`/content/units/${unitId}`),
        api.get<SectionType[]>('/content/section-types'),
        api.get<CurriculumOverview>('/content/overview'),
      ]);
      setUnit(detail);
      setTypes(sectionTypes);
      setContents(overview.units.find((one) => one.id === unitId) ?? null);
      setError(null);

      // Its own request, and its own failure: the test rules not loading is
      // worth saying on the test tab, not worth blanking the whole unit.
      try {
        setRules(await api.get<AssessmentRules>(`/content/units/${unitId}/assessment-rules`));
        setRulesFailed(false);
      } catch {
        setRulesFailed(true);
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.push('/login');
        return;
      }
      setError(
        caught instanceof ApiError && caught.status === 404
          ? 'That unit is not part of your course.'
          : 'This unit could not be loaded. Check your connection and try again.',
      );
    }
  }, [unitId, router]);

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

  async function run(work: () => Promise<unknown>, message: string) {
    setError(null);
    setNotice(null);
    try {
      await work();
      setNotice(message);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not work.');
    }
  }

  async function setVisibility(open: boolean) {
    setBusy(true);
    await run(
      () =>
        open
          ? api.post(`/content/units/${unitId}/publish`)
          : api.post(`/content/units/${unitId}/status`, { status: 'DRAFT' }),
      open ? 'This unit is now open to students.' : 'This unit is hidden from students again.',
    );
    setBusy(false);
  }

  if (!me) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (!unit) {
    return (
      <>
        <TeacherHeader me={me} />
        <main className="page stack">
          <button className="crumb" onClick={() => router.push('/content')}>
            <Icon name="back" />
            Curriculum
          </button>
          {error ? (
            <p className="alert error" role="alert">
              {error}{' '}
              <button className="small" onClick={() => void load()}>
                Try again
              </button>
            </p>
          ) : (
            <p className="muted">Loading…</p>
          )}
        </main>
      </>
    );
  }

  const live = unit.status === 'PUBLISHED';
  const todo = contents ? unfinished(contents) : [];
  const grammarSections = unit.sections.filter(
    (section) => section.type?.progressComponent === 'grammar',
  ).length;

  const tabs: { key: Tab; label: string; count: number | null }[] = [
    { key: 'vocabulary', label: 'Vocabulary', count: unit.vocabularyItems.length },
    { key: 'grammar', label: 'Grammar', count: grammarSections },
    { key: 'activities', label: 'Activity', count: contents?.activity.total ?? null },
    { key: 'assessment', label: 'Unit test', count: contents?.assessment.total ?? null },
  ];

  return (
    <>
      <TeacherHeader me={me} />
      <main className="page stack">
        <button className="crumb" onClick={() => router.push('/content')}>
          <Icon name="back" />
          Curriculum
        </button>

        <div className="unithead">
          <div className="unithead-id">
            <h1>{unit.title}</h1>
            <span className="flag" data-tone={live ? 'quiet' : 'hidden'}>
              <Icon name={live ? 'tick' : 'lock'} />
              {live ? 'Open to students' : 'Hidden from students'}
            </span>
            {unit.kind && <span className="muted">{unit.kind}</span>}
          </div>
          <button disabled={busy} onClick={() => void setVisibility(!live)}>
            {busy ? 'Working…' : live ? 'Hide from students' : 'Open to students'}
          </button>
        </div>

        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="alert ok" role="status">
            {notice}
          </p>
        )}

        {live && (
          <p className="alert warn">
            This unit is open. <strong>Every change you make here is live straight away</strong> —
            there is no separate draft copy. To work on it privately, hide it first.
          </p>
        )}

        {todo.length > 0 && (
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Still to do</h2>
              <span className="panel-note">Counted from what is stored</span>
            </div>
            <ul className="todo-list">
              {todo.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}

        <div className="tabs" role="tablist" aria-label="Parts of this unit">
          {tabs.map((one) => (
            <button
              key={one.key}
              role="tab"
              aria-selected={tab === one.key}
              onClick={() => setTab(one.key)}
              data-testid={`cms-tab-${one.key}`}
            >
              {one.label}
              {one.count !== null && <span className="num">{one.count}</span>}
            </button>
          ))}
        </div>

        {tab === 'vocabulary' && <VocabularyList unit={unit} onRun={run} />}

        {tab === 'grammar' && <SectionList unit={unit} types={types} onRun={run} />}

        {/*
          The same editor serves both, filtered by what the question is for.
          Practice and test questions differ in nothing a teacher writes — the
          wording, the choices, the marking are identical — so one editor with
          a filter is one place to fix a bug rather than two.
        */}
        {tab === 'activities' && (
          <>
            <StudentPreview unitId={unit.id} purpose="ACTIVITY" />
            <QuestionList
              key="activities"
              unitId={unit.id}
              purpose="ACTIVITY"
              sections={unit.sections}
              onRun={run}
            />
          </>
        )}

        {tab === 'assessment' && (
          <>
            <TestRules rules={rules} failed={rulesFailed} contents={contents} />
            <StudentPreview
              unitId={unit.id}
              purpose="ASSESSMENT"
              asked={rules?.questionCount ?? null}
            />
            <QuestionList
              key="assessment"
              unitId={unit.id}
              purpose="ASSESSMENT"
              sections={unit.sections}
              onRun={run}
            />
          </>
        )}
      </main>
    </>
  );
}

/**
 * The rules this unit's test will run under.
 *
 * Read-only, and said plainly, because a teacher writing test questions is
 * entitled to know the mark her students have to reach and how many tries they
 * get. These are settings resolved for this unit; changing one is not
 * something this screen does.
 */
function TestRules({
  rules,
  failed,
  contents,
}: {
  rules: AssessmentRules | null;
  failed: boolean;
  contents: UnitContents | null;
}) {
  if (failed) {
    return (
      <p className="alert error" role="alert">
        The rules for this test could not be loaded.
      </p>
    );
  }
  if (!rules) return <p className="muted">Loading the test rules…</p>;

  const pool = contents?.testPool;
  const asks =
    pool && rules.questionCount !== null
      ? Math.min(pool.available, rules.questionCount)
      : (pool?.available ?? null);

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">How this test runs</h2>
        <span className="panel-note">Set for the whole course</span>
      </div>
      <div className="panel-body stack">
        <dl className="rules">
          <div>
            <dt>Pass mark</dt>
            <dd>{rules.passingScore}%</dd>
          </div>
          <div>
            <dt>Tries allowed</dt>
            <dd>{rules.maxAttempts === null ? 'No limit' : rules.maxAttempts}</dd>
          </div>
          <div>
            <dt>Questions asked</dt>
            <dd>{asks === null ? '\u2014' : asks}</dd>
          </div>
          <div>
            <dt>Score kept</dt>
            <dd>{rules.resultPolicy === 'latest' ? 'The latest try' : 'Her best try'}</dd>
          </div>
        </dl>

        {pool && (
          <p className="note-line">
            {pool.available === 0 ? (
              <>
                There is nothing for this test to ask. Add test questions below, or publish
                activity questions — a unit with no test questions of its own uses its activity
                questions instead.
              </>
            ) : pool.source === 'activity' ? (
              <>
                This unit has no test questions of its own, so the test draws from its{' '}
                <strong>{pool.available} activity questions</strong>. Add a question here and the
                test will use only the questions you add.
              </>
            ) : (
              <>
                The test draws from the <strong>{pool.available} test questions</strong> below that
                are published and not waiting on your review.
              </>
            )}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * What a student would be shown.
 *
 * The platform's own preview route builds this: shuffled the way she would get
 * it, with every answer stripped on the server. Asking for it records nothing —
 * no attempt, no answer, no progress — so a teacher can look as often as she
 * likes without touching a single student's results.
 */
function StudentPreview({
  unitId,
  purpose,
  asked,
}: {
  unitId: string;
  purpose: 'ACTIVITY' | 'ASSESSMENT';
  /** How many of the pool one student is actually asked, when fewer than all. */
  asked?: number | null;
}) {
  const [shown, setShown] = useState<PresentedQuestion[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  async function look() {
    setBusy(true);
    setFailed(null);
    try {
      const got = await api.post<PresentedQuestion[]>(`/questions/unit/${unitId}/preview`, {
        purpose,
        seed: String(Date.now()),
      });
      setShown(got);
    } catch (caught) {
      setFailed(caught instanceof ApiError ? caught.message : 'The preview could not be built.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <h2 className="panel-title">See it as a student</h2>
        <span className="panel-note">Records nothing</span>
      </div>
      <div className="panel-body stack">
        <div className="row">
          <button onClick={() => void look()} disabled={busy}>
            {busy ? 'Building…' : shown ? 'Shuffle again' : 'Show me'}
          </button>
          {shown && (
            <button className="small" onClick={() => setShown(null)}>
              Close
            </button>
          )}
        </div>

        {failed && (
          <p className="alert error" role="alert">
            {failed}
          </p>
        )}

        {shown && shown.length === 0 && (
          <p className="note-line">
            Nothing would be shown. A question appears here once it is published and no longer
            waiting on your review.
          </p>
        )}

        {shown && shown.length > 0 && typeof asked === 'number' && asked < shown.length && (
          <p className="note-line">
            These are the {shown.length} questions the test can draw on. Each student is asked{' '}
            <strong>{asked}</strong> of them, shuffled afresh for her.
          </p>
        )}

        {shown && shown.length > 0 && (
          <ol className="preview-list">
            {shown.map((question) => (
              <li key={question.id}>
                <p className="preview-prompt">{question.prompt}</p>
                <PreviewChoices payload={question.payload} />
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

/** The choices a student would be offered, in the order she would see them. */
function PreviewChoices({ payload }: { payload: Record<string, unknown> }) {
  const options = Array.isArray(payload.options)
    ? (payload.options as { id: string; text: string }[])
    : null;
  const tokens = Array.isArray(payload.tokens)
    ? (payload.tokens as { id: string; text: string }[])
    : null;

  if (options) {
    return (
      <ul className="preview-options">
        {options.map((option) => (
          <li key={option.id}>{option.text}</li>
        ))}
      </ul>
    );
  }

  if (tokens) {
    return (
      <p className="preview-tokens">
        {tokens.map((token) => (
          <span key={token.id}>{token.text}</span>
        ))}
      </p>
    );
  }

  return null;
}

function SectionList({
  unit,
  types,
  onRun,
}: {
  unit: UnitDetail;
  types: SectionType[];
  onRun: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState('');
  const [editing, setEditing] = useState<Section | null>(null);

  return (
    <div className="card stack">
      <div className="between">
        <h2 style={{ margin: 0 }}>Sections ({unit.sections.length})</h2>
        <div className="row">
          <select
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            style={{ padding: '.5rem', borderRadius: 8, border: '1px solid var(--border)' }}
            aria-label="Section type to add"
          >
            <option value="">Add a section…</option>
            {types.map((t) => (
              <option key={t.key} value={t.key}>
                {t.orderIndex}. {t.displayName}
              </option>
            ))}
          </select>
          <button
            disabled={!adding}
            onClick={() => {
              const key = adding;
              setAdding('');
              void onRun(
                () => api.post(`/content/units/${unit.id}/sections`, { typeKey: key }),
                'Section added as a draft.',
              );
            }}
          >
            Add
          </button>
        </div>
      </div>

      {unit.sections.length === 0 ? (
        <p className="muted">No sections yet. Choose a type above to add one.</p>
      ) : (
        unit.sections.map((section) => (
          <div
            key={section.id}
            className="card"
            style={{ background: 'var(--bg)' }}
            data-section-id={section.id}
            data-section-type={section.typeKey}
          >
            <div className="between">
              <div>
                <strong>{section.title ?? section.type.displayName}</strong>{' '}
                <span className="muted">· {section.type.displayName}</span>
                {section.type.isPaperBased && (
                  <span className="badge disabled" style={{ marginLeft: '.5rem' }}>
                    Done on paper
                  </span>
                )}
                {section.needsReview && (
                  <span className="badge warn" style={{ marginLeft: '.5rem' }}>
                    Needs your check
                  </span>
                )}
              </div>
              <div className="row">
                <span className={`badge ${section.status === 'PUBLISHED' ? 'active' : 'disabled'}`}>
                  {section.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                </span>
                <button className="small" onClick={() => setEditing(editing?.id === section.id ? null : section)}>
                  {editing?.id === section.id ? 'Close' : 'Edit'}
                </button>
                <button
                  className="small danger"
                  onClick={() =>
                    onRun(() => api.del(`/content/sections/${section.id}`), 'Section removed.')
                  }
                >
                  Remove
                </button>
              </div>
            </div>

            {section.type.isPaperBased && (
              <p className="muted" style={{ marginTop: '.5rem' }}>
                This kind of practice is done on paper. It is shown to students for reference and
                is not answered on screen.
              </p>
            )}

            {section.needsReview && (
              <div className="alert warn" style={{ marginTop: '.5rem' }} data-testid="section-review">
                <p style={{ margin: 0 }}>{section.reviewNotes}</p>
                <button
                  className="small"
                  style={{ marginTop: '.5rem' }}
                  data-testid="section-review-confirm"
                  onClick={() =>
                    onRun(
                      () =>
                        api.patch(`/content/sections/${section.id}`, { needsReview: false }),
                      'Checked.',
                    )
                  }
                >
                  I have checked this
                </button>
              </div>
            )}

            {editing?.id === section.id ? (
              <SectionEditor
                section={section}
                onCancel={() => setEditing(null)}
                onChanged={() => onRun(async () => undefined, 'Picture updated.')}
                onSave={(changes) =>
                  onRun(
                    () => api.patch(`/content/sections/${section.id}`, changes),
                    'Section saved.',
                  ).then(() => setEditing(null))
                }
              />
            ) : (
              section.body && (
                <p style={{ whiteSpace: 'pre-wrap', marginTop: '.5rem' }}>{section.body}</p>
              )
            )}
          </div>
        ))
      )}
    </div>
  );
}

function SectionEditor({
  section,
  onSave,
  onCancel,
  onChanged,
}: {
  section: Section;
  onSave: (changes: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
  onChanged: () => Promise<void>;
}) {
  const [title, setTitle] = useState(section.title ?? '');
  const [body, setBody] = useState(section.body ?? '');
  // One example per line, which is how a teacher would type a list.
  const [examples, setExamples] = useState((section.examples ?? []).join('\n'));
  const [videoUrl, setVideoUrl] = useState(section.videoUrl ?? '');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    await onSave({
      title,
      body,
      videoUrl,
      examples: examples
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== ''),
    });
    setBusy(false);
  }

  /**
   * Attaches a picture.
   *
   * Read in the browser and sent as text, so there is no upload endpoint of a
   * different shape to secure separately. What may be sent, and how large, is
   * decided by the API — this only reports what it says.
   */
  async function upload(file: File) {
    setProblem(null);
    setUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('read failed'));
        reader.readAsDataURL(file);
      });

      await api.post(`/content/sections/${section.id}/images`, {
        data,
        mimeType: file.type,
        altText: file.name.replace(/\.[^.]+$/, ''),
      });
      await onChanged();
    } catch (caught) {
      setProblem(
        caught instanceof ApiError ? caught.message : 'That picture could not be added.',
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: '.75rem' }}>
      {problem && (
        <p className="alert error" role="alert">
          {problem}
        </p>
      )}

      <label htmlFor={`t-${section.id}`}>Title</label>
      <input
        id={`t-${section.id}`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        data-testid="section-title"
      />

      <label htmlFor={`b-${section.id}`}>Explanation</label>
      <textarea
        id={`b-${section.id}`}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        data-testid="section-body"
      />

      <label htmlFor={`x-${section.id}`}>Examples — one per line</label>
      <textarea
        id={`x-${section.id}`}
        value={examples}
        onChange={(e) => setExamples(e.target.value)}
        rows={4}
        data-testid="section-examples"
      />

      <label htmlFor={`v-${section.id}`}>Video link (optional)</label>
      <input
        id={`v-${section.id}`}
        value={videoUrl}
        onChange={(e) => setVideoUrl(e.target.value)}
        placeholder="https://www.youtube.com/watch?v=..."
        data-testid="section-video"
      />
      <p className="muted" style={{ marginTop: '-.35rem', fontSize: 'var(--fs-small)' }}>
        Paste the link to a YouTube or Google Drive video. Leave empty for no video. The
        link is checked when you save, so you find out here rather than a student finding
        an empty player.
      </p>

      <label htmlFor={`i-${section.id}`}>Picture (optional)</label>
      <input
        id={`i-${section.id}`}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        disabled={uploading}
        data-testid="section-image"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = '';
        }}
      />
      <p className="muted">
        PNG, JPEG, WEBP or GIF, up to 2 MB. Much of this curriculum is pictures, so a grammar
        page can be a scan of the page from the book.
      </p>

      {section.media.length > 0 && (
        <div className="row" style={{ marginTop: '.5rem' }}>
          {section.media.map((image) => (
            <div key={image.id} className="stack" style={{ gap: '.3rem' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={apiUrl(image.url)}
                alt={image.altText ?? ''}
                data-testid="section-image-preview"
                style={{ maxWidth: '10rem', borderRadius: 6, border: '1px solid var(--border)' }}
              />
              <button
                type="button"
                className="small danger"
                data-testid="remove-image"
                onClick={async () => {
                  await api.del(`/content/images/${image.id}`).catch(() => undefined);
                  await onChanged();
                }}
              >
                Remove picture
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="muted">
        Enter the material exactly as it appears in the curriculum. Do not reword or correct it.
      </p>

      <div className="row">
        <button className="primary" type="submit" disabled={busy} data-testid="save-section">
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function VocabularyList({
  unit,
  onRun,
}: {
  unit: UnitDetail;
  onRun: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [word, setWord] = useState('');
  const [meaning, setMeaning] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    await onRun(
      () =>
        api.post(`/content/units/${unit.id}/vocabulary`, {
          wordEn: word,
          ...(meaning.trim() ? { meaningAr: meaning.trim() } : {}),
        }),
      `"${word}" was added.`,
    );
    setWord('');
    setMeaning('');
    setBusy(false);
  }

  return (
    <div className="card">
      <h2>Vocabulary ({unit.vocabularyItems.length})</h2>

      <form onSubmit={add} className="row" style={{ alignItems: 'flex-end', gap: '.5rem' }}>
        <div style={{ flex: '1 1 10rem' }}>
          <label htmlFor="wordEn">English word</label>
          <input id="wordEn" value={word} onChange={(e) => setWord(e.target.value)} required />
        </div>
        <div style={{ flex: '1 1 10rem' }}>
          <label htmlFor="meaningAr">Arabic meaning</label>
          {/* The meaning is Arabic, so this field reads right-to-left while the
              rest of the interface stays English (SRS 39). */}
          <input
            id="meaningAr"
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            dir="rtl"
            lang="ar"
          />
        </div>
        <button className="primary" type="submit" disabled={busy || !word.trim()}>
          {busy ? 'Adding…' : 'Add word'}
        </button>
      </form>

      {unit.vocabularyItems.length > 0 && (
        <div className="table-wrap" style={{ marginTop: '1rem' }}>
          <table className="vocab-table">
            <thead>
              <tr>
                <th>English</th>
                <th>Arabic</th>
                <th>Sound</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {unit.vocabularyItems.map((item: VocabularyItem) => (
                <Fragment key={item.id}>
                  <tr>
                    <td data-label="English" className="word-cell">{item.wordEn}</td>
                    <td data-label="Arabic" dir="rtl" lang="ar">
                      {item.meaningAr ?? '\u2014'}
                    </td>
                    {/*
                      Whether the teacher recorded this word, said in the list
                      rather than only inside the editor — otherwise the only
                      way to know is to open all eight words one at a time.
                    */}
                    <td data-label="Sound">
                      {item.media?.some((file) => file.mimeType?.startsWith('audio/')) ? (
                        <span className="part" data-state="ready">
                          Your recording
                        </span>
                      ) : (
                        <span className="part" data-state="empty">
                          Device voice
                        </span>
                      )}
                    </td>
                    <td data-label="Status">
                      <span
                        className={`badge ${item.status === 'PUBLISHED' ? 'active' : 'disabled'}`}
                      >
                        {item.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                      </span>
                      {item.needsReview && (
                        <span
                          className="badge warn"
                          style={{ marginLeft: '.35rem' }}
                          title={item.reviewNotes ?? undefined}
                          data-testid={`word-review-${item.wordEn}`}
                        >
                          Check
                        </span>
                      )}
                    </td>
                    <td data-label="Actions">
                      <div className="row">
                        <button
                          className="small"
                          data-testid={`edit-word-${item.wordEn}`}
                          aria-label={`Edit the word ${item.wordEn}`}
                          onClick={() => setEditing(editing === item.id ? null : item.id)}
                        >
                          {editing === item.id ? 'Close' : 'Edit'}
                        </button>
                        <button
                          className="small danger"
                          onClick={() =>
                            onRun(
                              () => api.del(`/content/vocabulary/${item.id}`),
                              `"${item.wordEn}" was removed.`,
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editing === item.id && (
                    <tr>
                      <td colSpan={4}>
                        <WordEditor
                          item={item}
                          onRun={onRun}
                          onCancel={() => setEditing(null)}
                          onSave={(changes) =>
                            onRun(
                              () => api.patch(`/content/vocabulary/${item.id}`, changes),
                              'Word saved.',
                            ).then(() => setEditing(null))
                          }
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Correcting a word that is already in the list.
 *
 * Every field the word has, so a spelling or a meaning can be fixed in place.
 * Deleting and retyping was the only way before, and that threw away the
 * progress students had recorded against the word.
 */
function WordEditor({
  item,
  onSave,
  onCancel,
  onRun,
}: {
  item: VocabularyItem;
  onSave: (changes: Record<string, string | null>) => Promise<void>;
  onCancel: () => void;
  onRun: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [wordEn, setWordEn] = useState(item.wordEn);
  const [meaningAr, setMeaningAr] = useState(item.meaningAr ?? '');
  const [partOfSpeech, setPartOfSpeech] = useState(item.partOfSpeech ?? '');
  const [exampleSentence, setExampleSentence] = useState(item.exampleSentence ?? '');
  const [saving, setSaving] = useState(false);

  const trimmed = (value: string) => (value.trim() === '' ? null : value.trim());

  async function save() {
    setSaving(true);
    await onSave({
      wordEn: wordEn.trim(),
      meaningAr: trimmed(meaningAr),
      partOfSpeech: trimmed(partOfSpeech),
      exampleSentence: trimmed(exampleSentence),
    });
    setSaving(false);
  }

  return (
    <div className="stack" data-testid="word-editor">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 10rem' }}>
          <label htmlFor={`w-${item.id}`}>English word</label>
          <input
            id={`w-${item.id}`}
            value={wordEn}
            onChange={(e) => setWordEn(e.target.value)}
            data-testid="edit-wordEn"
          />
        </div>
        <div style={{ flex: '1 1 10rem' }}>
          <label htmlFor={`m-${item.id}`}>Arabic meaning</label>
          {/* Arabic reads right-to-left; the interface around it stays English. */}
          <input
            id={`m-${item.id}`}
            value={meaningAr}
            onChange={(e) => setMeaningAr(e.target.value)}
            dir="rtl"
            lang="ar"
            data-testid="edit-meaningAr"
          />
        </div>
      </div>

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 8rem' }}>
          <label htmlFor={`p-${item.id}`}>Part of speech</label>
          <input
            id={`p-${item.id}`}
            value={partOfSpeech}
            onChange={(e) => setPartOfSpeech(e.target.value)}
            placeholder="noun, verb, adjective…"
            data-testid="edit-partOfSpeech"
          />
        </div>
        <div style={{ flex: '2 1 14rem' }}>
          <label htmlFor={`e-${item.id}`}>Example sentence</label>
          <input
            id={`e-${item.id}`}
            value={exampleSentence}
            onChange={(e) => setExampleSentence(e.target.value)}
            data-testid="edit-exampleSentence"
          />
        </div>
      </div>

      <WordMedia item={item} onRun={onRun} />

      <p className="muted" style={{ margin: 0 }}>
        Enter the material exactly as it appears in the curriculum. Do not reword or correct it.
      </p>

      <div className="row">
        <button
          className="primary"
          onClick={save}
          disabled={saving || wordEn.trim() === ''}
          data-testid="save-word"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/**
 * A picture and a recording for one word.
 *
 * The recording is the fallback for a browser whose own voice does not work.
 * It never lets a student say she has heard a word — she still has to play it
 * (client, 2026-08-31) — so recording one adds a way through rather than a way
 * round.
 */
function WordMedia({
  item,
  onRun,
}: {
  item: VocabularyItem;
  onRun: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const media = item.media ?? [];
  const recording = media.find((m) => m.mimeType?.startsWith('audio/'));
  const picture = media.find((m) => m.mimeType?.startsWith('image/'));

  async function upload(file: File, what: string) {
    setBusy(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('read'));
        reader.readAsDataURL(file);
      });

      await onRun(
        () =>
          api.post(`/content/vocabulary/${item.id}/media`, {
            data,
            mimeType: file.type,
            altText: `${what} for ${item.wordEn}`,
          }),
        `${what} added.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row" style={{ alignItems: 'flex-start' }}>
      <div style={{ flex: '1 1 12rem' }}>
        <label htmlFor={`audio-${item.id}`}>
          {recording ? 'Replace your recording' : 'Record this word yourself (optional)'}
        </label>
        <input
          id={`audio-${item.id}`}
          type="file"
          accept="audio/*"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file, 'Recording');
            e.target.value = '';
          }}
          data-testid="word-audio-upload"
        />
        {recording ? (
          <div className="row" style={{ marginTop: '.4rem' }}>
            {/* A recording of one word: there is nothing to caption. */}
            <audio controls src={apiUrl(recording.url)} data-testid="word-audio" />
            <button
              className="small danger"
              onClick={() =>
                onRun(() => api.del(`/content/media/${recording.id}`), 'Recording removed.')
              }
            >
              Remove
            </button>
          </div>
        ) : (
          // Said plainly, because the alternative is a teacher assuming
          // silence and recording all 132 words to be safe.
          <p className="muted" style={{ margin: '.4rem 0 0' }}>
            No recording. Students hear this word read by their own device&rsquo;s English voice,
            which is enough for most words — record one where the device gets it wrong.
          </p>
        )}
      </div>

      <div style={{ flex: '1 1 12rem' }}>
        <label htmlFor={`pic-${item.id}`}>Picture for this word</label>
        <input
          id={`pic-${item.id}`}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file, 'Picture');
            e.target.value = '';
          }}
          data-testid="word-picture-upload"
        />
        {picture && (
          <div className="row" style={{ marginTop: '.4rem' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={apiUrl(picture.url)} alt={`A picture of ${item.wordEn}`} className="word-picture" />
            <button
              className="small danger"
              onClick={() => onRun(() => api.del(`/content/media/${picture.id}`), 'Picture removed.')}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
