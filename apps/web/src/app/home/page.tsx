'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError, homeFor, LearnUnitSummary, Me } from '@/lib/api';
import { Avatar, StudentNav, TopBar } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Scene, Glyph } from '@/components/world/Scene';
import { Girl } from '@/components/world/Girl';
import { WorldGround } from '@/components/world/WorldGround';
import { themeFor, themeVars } from '@/lib/world';

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

/**
 * The encouraging line on the ticket, per kind of work.
 *
 * It sits on the ticket's paper rather than over the drawing: white type on a
 * white pill over a white cloud was one shape too many, and the drawing reads
 * better with nothing written across it.
 */
const ASK: Record<Step['kind'], string> = {
  vocabulary: 'Ready for more words?',
  grammar: 'Ready for the next challenge?',
  activity: 'Time to play!',
  assessment: 'One more step!',
};

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

      <WorldGround />
      <main className="page has-navbar home-grid world">
        <div className="home-aside">
        {/* Somebody is here to say hello. She is a drawing beside the words,
            not instead of them: every line still reads with her removed. */}
        <header className="greeting greeting-hi">
          <Girl who="lina" pose="wave" mood="bright" className="girl greeting-girl" />
          <div>
            <h1>
              Hello, {me.displayName.split(' ')[0]}!
            </h1>
            <p className="greeting-ask">
              {core.length === 0
                ? 'Your course is on its way.'
                : finishedUnits === core.length
                  ? 'You finished every unit!'
                  : 'Ready for another English adventure?'}
            </p>
            {/*
              One line of fact under it, and it has to earn its place: what is
              actually true of her course right now, not a slogan.
            */}
            <p className="greeting-line">
              {core.length === 0
                ? 'Your course opens as soon as your teacher adds the first unit.'
                : finishedUnits === core.length
                  ? 'Play a game, or go back over a unit you enjoyed.'
                  : finishedUnits === 0
                    ? `${core.length} units to work through. Start whenever you are ready.`
                    : `${finishedUnits} of ${core.length} units finished. Keep going.`}
            </p>
          </div>
        </header>

        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}

        {/* The one thing she should do next, said once and said plainly —
            on a ticket drawn in the place her unit lives. */}
        {current && action && (
          <button
            className="today"
            data-kind={action.kind}
            style={themeVars(themeFor(current.title, true, core.indexOf(current)))}
            onClick={() => router.push(`/learn/${current.id}`)}
            data-testid="next-action"
          >
            <span className="today-scene">
              <Scene kind={themeFor(current.title, true, core.indexOf(current)).scene} fit="fill" />
              <Girl who="lina" pose="walk" className="girl today-girl" />
            </span>
            <span className="today-body">
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
                <span className="today-ask">{ASK[action.kind]}</span>
                <span className="today-what">{action.what}</span>
                <span className="today-why">{current.title}</span>
                <span className="today-why">{action.why}</span>
                {action.kind === 'vocabulary' && current.progress.vocabulary.total > 0 && (
                  <span className="tally" aria-hidden="true">
                    {Array.from({ length: current.progress.vocabulary.total }, (_, n) => (
                      <i key={n} data-on={n < current.progress.vocabulary.done} />
                    ))}
                  </span>
                )}
              </span>
              <span className="today-go" aria-hidden="true">
                <Icon name="play" size={16} />
                Let&rsquo;s go
              </span>
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
              const theme = themeFor(unit.title, true, i);
              return (
                <div
                  className="station"
                  data-state={state}
                  key={unit.id}
                  style={themeVars(theme)}
                >
                  {/* The station on the rail: the mark of the place this
                      unit lives in, or a tick once it is behind her. */}
                  <span className="station-badge" aria-hidden="true">
                    {p.isComplete ? <Icon name="tick" size={18} /> : <Glyph kind={theme.scene} />}
                  </span>
                  <button
                    className="station-card"
                    data-testid="unit-card"
                    onClick={() => router.push(`/learn/${unit.id}`)}
                  >
                    <div className="between" style={{ gap: '.75rem' }}>
                      <div style={{ minWidth: 0 }}>
                        <span className="row" style={{ gap: '.5rem' }}>
                          <span className="station-no">Unit {i + 1}</span>
                          {/* Where she stands, in her words. */}
                          {p.isComplete ? (
                            <span className="station-word" data-tone="done">
                              <Icon name="star" size={11} />
                              Unit complete!
                            </span>
                          ) : state === 'current' ? (
                            <span className="station-word" data-tone="here">You are here</span>
                          ) : (
                            <span className="station-word" data-tone="soon">Coming up</span>
                          )}
                        </span>
                        <span className="station-title" style={{ display: 'block' }}>
                          {unit.title}
                        </span>
                      </div>
                      {/* The chip beside the unit's number already says
                          "complete"; the figure is for a unit still going. */}
                      {!p.isComplete && p.overallPercent > 0 && (
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
            style={themeVars(themeFor(unit.title, false))}
            onClick={() => router.push(`/learn/${unit.id}`)}
          >
            <span className="aside-icon" aria-hidden="true">
              <Glyph kind={themeFor(unit.title, false).scene} size={20} />
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
