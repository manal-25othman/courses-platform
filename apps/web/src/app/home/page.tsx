'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError, homeFor, LearnUnitSummary, Me } from '@/lib/api';
import { Avatar, StudentNav, TopBar } from '@/components/Shell';
import { Icon } from '@/components/Icon';

/**
 * Where a student starts: her course, drawn as the run of units it is.
 *
 * The screen answers two questions in the order she asks them — "what do I do
 * now?" at the top, then "where am I up to?" below. The run of stations is the
 * progress view; there is no separate dashboard, because a second view of the
 * same numbers would only be something else to keep in step.
 *
 * Only units her teacher has published appear. That is the API's doing, not a
 * filter this page has to remember to apply.
 */

/** One of the four parts of a unit, as it stands for her right now. */
interface Step {
  kind: 'vocabulary' | 'grammar' | 'activity' | 'assessment';
  label: string;
  /** What to say under the node: a count, a score, a verdict. */
  value: string;
  /**
   * `done`   — finished.
   * `current`— the next thing she can actually do here.
   * `todo`   — open, but not next.
   * `locked` — the server refuses it until something earlier is finished.
   * `empty`  — her teacher has not built this part yet.
   */
  /*
    `spent` is used where she has no tries left and did not pass: the server
    refuses it, but for a reason no amount of work will change, so it must
    not be drawn as a padlock or offered as her next step.
  */
  state: 'done' | 'current' | 'todo' | 'locked' | 'spent' | 'empty';
}

/**
 * The four parts of a unit, read from her progress and from nothing else.
 *
 * `locked` is never a guess: vocabulary gating grammar and grammar gating the
 * test are the API's own rules, and they arrive here as `grammarLock.locked`
 * and `assessmentState.blockedBecause`. If the server would let her in, the
 * screen does not draw a padlock.
 */
function stepsOf(unit: LearnUnitSummary): Step[] {
  const p = unit.progress;

  const vocabulary: Step = {
    kind: 'vocabulary',
    label: 'Words',
    value: p.vocabulary.empty ? 'None yet' : `${p.vocabulary.done}/${p.vocabulary.total}`,
    state: p.vocabulary.empty ? 'empty' : p.vocabulary.percent === 100 ? 'done' : 'todo',
  };

  const grammarBlocked = p.grammarLock.locked;
  const grammar: Step = {
    kind: 'grammar',
    label: 'Grammar',
    value: p.grammar.empty ? 'None yet' : `${p.grammar.done}/${p.grammar.total}`,
    state: p.grammar.empty
      ? 'empty'
      : p.grammar.percent === 100
        ? 'done'
        : grammarBlocked
          ? 'locked'
          : 'todo',
  };

  const activity: Step = {
    kind: 'activity',
    label: 'Activity',
    value: p.activity.empty
      ? 'None yet'
      : p.bestScorePercent === null
        ? 'Not tried'
        : `${p.bestScorePercent}%`,
    state: p.activity.empty ? 'empty' : p.activity.percent === 100 ? 'done' : 'todo',
  };

  // The test is locked only where the API says so, and only for the two
  // reasons that are about the sequence. Having used up her tries, or having
  // already passed, is not a lock — it is a finished state.
  const why = p.assessmentState.blockedBecause;
  const testLocked = why === 'vocabulary_incomplete' || why === 'grammar_incomplete';
  const testSpent = why === 'no_attempts_left';
  const assessment: Step = {
    kind: 'assessment',
    label: 'Test',
    value: p.assessment.empty
      ? 'None yet'
      : p.assessmentState.passed
        ? 'Passed'
        : p.assessmentState.bestScorePercent !== null
          ? `${p.assessmentState.bestScorePercent}%`
          : 'Not tried',
    state: p.assessment.empty
      ? 'empty'
      : p.assessmentState.passed
        ? 'done'
        : testLocked
          ? 'locked'
          : testSpent
            ? 'spent'
            : 'todo',
  };

  const steps = [vocabulary, grammar, activity, assessment];
  // Exactly one step is "current": the first she can actually get on with.
  const next = steps.find((step) => step.state === 'todo');
  if (next) next.state = 'current';
  return steps;
}

/** True when this unit has something she can actually get on with now. */
function hasWork(unit: LearnUnitSummary) {
  return stepsOf(unit).some((step) => step.state === 'current');
}

/** The single next action across the whole course, said in her words. */
function nextAction(unit: LearnUnitSummary, steps: Step[]) {
  const p = unit.progress;
  const current = steps.find((step) => step.state === 'current');
  if (!current) return null;
  const wording: Record<Step['kind'], { what: string; why: string }> = {
    vocabulary: {
      what: 'Learn the words',
      why: `${p.vocabulary.done} of ${p.vocabulary.total} learned`,
    },
    grammar: { what: 'Read the grammar', why: 'Your words are done' },
    activity: { what: 'Play the activity', why: 'Practise as often as you like' },
    assessment: {
      what: 'Take the test',
      why: `${p.assessmentState.questionCount} questions to pass the unit`,
    },
  };
  return { ...wording[current.kind], kind: current.kind, step: current };
}

export default function StudentHomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [units, setUnits] = useState<LearnUnitSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then((user) => {
        if (user.role !== 'STUDENT' || user.mustChangePassword) {
          router.replace(homeFor(user));
          return;
        }
        setMe(user);
      })
      .catch(() => router.replace('/login'));
  }, [router]);

  useEffect(() => {
    if (!me) return;
    api
      .get<LearnUnitSummary[]>('/learn/units')
      .then(setUnits)
      .catch((caught) => {
        setUnits([]);
        setError(caught instanceof ApiError ? caught.message : 'Your units could not be loaded. Try again in a moment.');
      });
  }, [me]);

  async function signOut() {
    await api.post('/auth/logout').catch(() => undefined);
    router.push('/login');
  }

  if (!me) {
    return (
      <>
        <TopBar nav />
        <main className="page">
          <div className="skeleton" style={{ height: '2rem', width: '12rem' }} />
          <div className="skeleton" style={{ height: '6rem', marginTop: '1.5rem' }} />
          <div className="skeleton" style={{ height: '9rem', marginTop: '1rem' }} />
        </main>
      </>
    );
  }

  const core = (units ?? []).filter((u) => u.progress.countsTowardCompletion);
  const extra = (units ?? []).filter((u) => !u.progress.countsTowardCompletion);
  // Where she is up to: the first unit she has not finished.
  const currentId = core.find((u) => !u.progress.isComplete)?.id;
  const current = core.find(hasWork);
  const action = current ? nextAction(current, stepsOf(current)) : null;
  const finishedUnits = core.filter((u) => u.progress.isComplete).length;

  return (
    <>
      <TopBar
        nav
        right={
          <span className="row" style={{ gap: '.5rem', flexWrap: 'nowrap' }}>
            <button className="ghost small" onClick={signOut}>
              <Icon name="signout" />
              <span className="hide-sm">Sign out</span>
            </button>
            <Avatar name={me.displayName} />
          </span>
        }
      />

      <main className="page has-navbar home-grid">
        <div className="home-aside">
        <header className="greeting">
          <h1>Hello, {me.displayName.split(' ')[0]}</h1>
          {/*
            One line, and it has to earn its place: what is actually true of
            her course right now, not a slogan. An empty course says so.
          */}
          <p className="greeting-line">
            {core.length === 0
              ? 'Your course opens as soon as your teacher adds the first unit.'
              : finishedUnits === core.length
                ? 'You have finished every unit. Play a game, or go back over one.'
                : finishedUnits === 0
                  ? `${core.length} units to work through. Start whenever you are ready.`
                  : `${finishedUnits} of ${core.length} units finished. Keep going.`}
          </p>
        </header>

        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}

        {/* The one thing she should do next, said once and said plainly. */}
        {current && action && (
          <button
            className="next-up"
            data-kind={action.kind}
            onClick={() => router.push(`/learn/${current.id}`)}
            data-testid="next-action"
          >
            <span className="badge-icon" aria-hidden="true">
              <Icon
                name={
                  action.kind === 'assessment'
                    ? 'assessment'
                    : action.kind === 'grammar'
                      ? 'grammar'
                      : action.kind === 'activity'
                        ? 'activity'
                        : 'words'
                }
                size={22}
              />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="what">{action.what}</span>
              {/* Her unit, then her standing in it — as two facts on two
                  lines, not a string of them joined by dots. */}
              <span className="why" style={{ display: 'block' }}>
                {current.title}
              </span>
              <span className="why" style={{ display: 'block' }}>
                {action.why}
              </span>
              {action.kind === 'vocabulary' && current.progress.vocabulary.total > 0 && (
                <span className="tally" aria-hidden="true" style={{ marginTop: '.5rem' }}>
                  {Array.from({ length: current.progress.vocabulary.total }, (_, n) => (
                    <i key={n} data-on={n < current.progress.vocabulary.done} />
                  ))}
                </span>
              )}
            </span>
            <span className="go" aria-hidden="true">
              <Icon name="play" size={16} />
            </span>
          </button>
        )}

        </div>

        <div className="home-main">
        <h2 className="marked-title">Your course</h2>

        {units === null ? (
          <div className="stack">
            <div className="skeleton" style={{ height: '7rem' }} />
            <div className="skeleton" style={{ height: '7rem' }} />
          </div>
        ) : core.length === 0 ? (
          <div className="card">
            <h2>Your units are on their way</h2>
            <p className="muted" style={{ marginTop: '.5rem' }}>
              Your teacher is still putting this course together. It will show up here as soon as
              she opens the first unit.
            </p>
          </div>
        ) : (
          <div className="journey journey-in" data-testid="unit-grid">
            {core.map((unit, i) => {
              const p = unit.progress;
              const state = p.isComplete ? 'done' : unit.id === currentId ? 'current' : 'todo';
              const steps = stepsOf(unit);
              return (
                <div className="station" data-state={state} key={unit.id}>
                  <button
                    className="station-card"
                    data-testid="unit-card"
                    onClick={() => router.push(`/learn/${unit.id}`)}
                  >
                    <div className="between" style={{ gap: '.75rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <span className="station-no">Unit {i + 1}</span>
                        <span className="station-title" style={{ display: 'block' }}>
                          {unit.title}
                        </span>
                      </div>
                      {p.isComplete ? (
                        <span className="finished-mark">
                          <Icon name="tick" size={14} />
                          Finished
                        </span>
                      ) : (
                        <strong className="station-pct num">{p.overallPercent}%</strong>
                      )}
                    </div>

                    {/*
                      The four parts, drawn as the sequence the server actually
                      enforces. A connector fills only behind a finished step,
                      so the line itself shows how far she has come.
                    */}
                    <ol className="track" data-testid="unit-parts">
                      {steps.map((step, at) => (
                        <li
                          className="track-step"
                          key={step.kind}
                          data-kind={step.kind}
                          data-state={step.state}
                          data-fill-before={at > 0 && steps[at - 1].state === 'done'}
                          data-fill-after={step.state === 'done'}
                        >
                          <span className="track-node" aria-hidden="true">
                            {step.state === 'done' ? (
                              <Icon name="tick" size={15} />
                            ) : step.state === 'locked' ? (
                              <Icon name="lock" size={14} />
                            ) : step.state === 'spent' ? (
                              <Icon name="cross" size={14} />
                            ) : (
                              <Icon name={step.kind === 'vocabulary' ? 'words' : step.kind} size={15} />
                            )}
                          </span>
                          <span className="track-label">{step.label}</span>
                          <span className="track-value" data-testid={`part-${step.kind}`}>
                            {step.value}
                          </span>
                        </li>
                      ))}
                    </ol>

                    {p.missingContent.length > 0 && (
                      <p className="muted" style={{ margin: '.75rem 0 0', fontSize: 'var(--fs-small)' }}>
                        Your teacher is still adding part of this unit.
                      </p>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/*
          Grammar Review sits after the course rather than inside it: it is
          revision, and it does not count towards finishing the four units.
        */}
        {extra.map((unit) => (
          <button
            key={unit.id}
            className="aside-card"
            data-kind="grammar"
            onClick={() => router.push(`/learn/${unit.id}`)}
          >
            <span className="aside-icon" aria-hidden="true">
              <Icon name="grammar" size={20} />
            </span>
            <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: '.2rem' }}>
              <span className="row" style={{ gap: '.5rem' }}>
                <strong className="aside-title">{unit.title}</strong>
                <span className="aside-tag">Extra</span>
              </span>
              {/* Said as what it is for, not as what it is missing. */}
              <span className="muted">
                Revision whenever you want it. It sits outside your four units, so nothing here
                changes your course progress.
              </span>
            </span>
          </button>
        ))}
        </div>
      </main>

      <StudentNav />
    </>
  );
}
