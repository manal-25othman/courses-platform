'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api, ApiError, homeFor, LearnUnitSummary, Me, MyTeacher } from '@/lib/api';
import { Avatar, StudentNav, TopBar } from '@/components/Shell';
import { Icon } from '@/components/Icon';
import { Glyph } from '@/components/world/Scene';
import { Girl } from '@/components/world/Girl';
import { Valley } from '@/components/world/Valley';
import { TeacherContact } from '@/components/TeacherContact';
import { themeFor, themeVars, PLACES } from '@/lib/world';

/**
 * Where a student starts: her course, drawn as the road it is.
 *
 * On the sign-in page she stood at the trailhead and looked down a path into
 * a valley. This is that path. The units are the places along it, in the
 * order the course runs, and she is somewhere on it -- so the screen answers
 * her three questions with one object each rather than with three panels
 * saying the same thing:
 *
 *   "Where am I?"          the pin on the trail
 *   "Where do I go next?"  the one open stop, with the work on it
 *   "What have I done?"    the trail inked in behind her
 *
 * That is the change from the old screen, which carried a ticket naming the
 * next action AND a list of stations repeating the same unit, the same state
 * and the same numbers. One of them had to go; neither could go on its own,
 * because each did half the job. So the stop she is standing on is the
 * ticket, and every other stop is a marker.
 *
 * Nothing about her course changed. Only units her teacher has published
 * appear, the order is the course's order, and every state drawn here is one
 * the API reports -- `stepsOf` below is unchanged, down to the comments.
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

/** The encouraging line above the work, per kind. */
const ASK: Record<Step['kind'], string> = {
  vocabulary: 'Ready for more words?',
  grammar: 'Ready for the next challenge?',
  activity: 'Time to play!',
  assessment: 'One more step!',
};

const KIND_ICON: Record<Step['kind'], 'words' | 'grammar' | 'activity' | 'assessment'> = {
  vocabulary: 'words',
  grammar: 'grammar',
  activity: 'activity',
  assessment: 'assessment',
};

/**
 * The four parts of a unit, drawn along the stop she is standing on.
 *
 * Same facts and same states as the old step track; drawn here as marks on
 * the trail rather than as a row of boxed nodes, because on this screen they
 * are the last stretch of the same road.
 */
function Parts({ steps }: { steps: Step[] }) {
  return (
    <ol className="trail-parts" data-testid="unit-parts">
      {steps.map((step) => (
        <li className="trail-part" key={step.kind} data-kind={step.kind} data-state={step.state}>
          <span className="trail-part-node" aria-hidden="true">
            {step.state === 'done' ? (
              <Icon name="tick" size={14} />
            ) : step.state === 'locked' ? (
              <Icon name="lock" size={13} />
            ) : step.state === 'spent' ? (
              <Icon name="cross" size={13} />
            ) : (
              <Icon name={KIND_ICON[step.kind]} size={14} />
            )}
          </span>
          <span className="trail-part-label">{step.label}</span>
          <span className="trail-part-value" data-testid={`part-${step.kind}`}>
            {step.value}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function StudentHomePage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [units, setUnits] = useState<LearnUnitSummary[] | null>(null);
  const [teacher, setTeacher] = useState<MyTeacher | null>(null);
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

  /*
    Her own teacher, for the contact card. It is a separate request on purpose:
    a school that has not assigned her a teacher, or an API that is slow to
    answer, must not hold up her course.
  */
  useEffect(() => {
    if (!me) return;
    api.get<MyTeacher | null>('/teachers/mine').then(setTeacher).catch(() => setTeacher(null));
  }, [me]);

  useEffect(() => {
    if (!me) return;
    api
      .get<LearnUnitSummary[]>('/learn/units')
      .then(setUnits)
      .catch((caught) => {
        setUnits([]);
        setError(
          caught instanceof ApiError
            ? caught.message
            : 'Your units could not be loaded. Try again in a moment.',
        );
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

      {/* The valley, behind everything, edge to edge. It takes the meadow's
          own tints -- the ones the sign-in page is drawn in -- so stepping
          through the door does not change the weather. */}
      <div className="valley-hold" style={themeVars(PLACES.meadow)} aria-hidden="true">
        <Valley />
      </div>

      <main className="page has-navbar trail-page">
        {/* Lina welcomes her in, and says it once. */}
        <header className="trail-welcome">
          <Girl who="lina" pose="wave" mood="bright" className="girl trail-girl" />
          <div className="trail-hello">
            <h1>Hello, {me.displayName.split(' ')[0]}!</h1>
            <p className="trail-ask">
              {core.length === 0
                ? 'Your course is on its way.'
                : finishedUnits === core.length
                  ? 'You finished every unit!'
                  : 'Ready for another English adventure?'}
            </p>
            <p className="trail-line">
              {core.length === 0
                ? 'Your course opens as soon as your teacher adds the first unit.'
                : finishedUnits === core.length
                  ? 'Play a game, or go back over a unit you enjoyed.'
                  : finishedUnits === 0
                    ? `${core.length} ${core.length === 1 ? 'unit' : 'units'} to work through. Start whenever you are ready.`
                    : `${finishedUnits} of ${core.length} ${core.length === 1 ? 'unit' : 'units'} finished. Keep going.`}
            </p>
          </div>
        </header>

        <TeacherContact teacher={teacher} studentName={me.displayName} />

        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}

        {units === null ? (
          <div className="stack">
            <div className="skeleton" style={{ height: '7rem' }} />
            <div className="skeleton" style={{ height: '7rem' }} />
          </div>
        ) : core.length === 0 ? (
          <div className="trail-empty">
            <h2>Your units are on their way</h2>
            <p className="muted" style={{ marginTop: '.5rem' }}>
              Your teacher is still putting this course together. It will show up here as soon as
              she opens the first unit.
            </p>
          </div>
        ) : (
          <ol className="trail" data-testid="unit-grid">
            {core.map((unit, i) => {
              const p = unit.progress;
              const open = unit.id === currentId;
              const state = p.isComplete ? 'done' : open ? 'current' : 'todo';
              const steps = stepsOf(unit);
              const theme = themeFor(unit.title, true, i);
              const here = current?.id === unit.id ? action : null;

              return (
                <li
                  className="trail-stop"
                  data-state={state}
                  data-open={open}
                  key={unit.id}
                  style={themeVars(theme)}
                >
                  {/* The marker on the trail: the place's own mark, a tick
                      once she is past it. */}
                  <span className="trail-mark" aria-hidden="true">
                    {p.isComplete ? <Icon name="tick" size={20} /> : <Glyph kind={theme.scene} />}
                  </span>

                  <button
                    className="trail-body"
                    data-testid="unit-card"
                    onClick={() => router.push(`/learn/${unit.id}`)}
                  >
                    <span className="trail-head">
                      <span className="trail-where">
                        <span className="trail-no">Unit {i + 1}</span>
                        {p.isComplete ? (
                          <span className="trail-word" data-tone="done">
                            <Icon name="star" size={11} />
                            Unit complete!
                          </span>
                        ) : open ? (
                          <span className="trail-word" data-tone="here">
                            You are here
                          </span>
                        ) : (
                          <span className="trail-word" data-tone="soon">
                            Coming up
                          </span>
                        )}
                      </span>
                      <span className="trail-title">{unit.title}</span>
                      {!p.isComplete && p.overallPercent > 0 && (
                        <span className="trail-pct num">{p.overallPercent}%</span>
                      )}
                    </span>

                    {/* The stop she is standing on opens: the four parts, and
                        the one thing she can get on with, on the spot. Every
                        other stop stays a marker, because repeating this for
                        units she cannot start yet is what made the old screen
                        say everything twice. */}
                    {open && (
                      <>
                        <Parts steps={steps} />
                        {here && (
                          <span className="trail-do" data-kind={here.kind} data-testid="next-action">
                            <span className="trail-do-mark" aria-hidden="true">
                              <Icon name={KIND_ICON[here.kind]} size={20} />
                            </span>
                            <span className="trail-do-words">
                              <span className="trail-do-ask">{ASK[here.kind]}</span>
                              <span className="trail-do-what">{here.what}</span>
                              <span className="trail-do-why">{here.why}</span>
                            </span>
                            <span className="trail-go" aria-hidden="true">
                              <Icon name="play" size={15} />
                              Let&rsquo;s go
                            </span>
                          </span>
                        )}
                      </>
                    )}

                    {open && p.missingContent.length > 0 && (
                      <span className="trail-note">
                        Your teacher is still adding part of this unit.
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {/* Grammar Review sits past the end of the trail: it is revision, and
            it does not count towards finishing the four units. */}
        {extra.map((unit) => (
          <button
            key={unit.id}
            className="trail-extra"
            style={themeVars(themeFor(unit.title, false))}
            onClick={() => router.push(`/learn/${unit.id}`)}
          >
            <span className="trail-extra-mark" aria-hidden="true">
              <Glyph kind={themeFor(unit.title, false).scene} size={20} />
            </span>
            <span className="trail-extra-words">
              <span className="trail-extra-head">
                <strong className="trail-extra-title">{unit.title}</strong>
                <span className="trail-extra-tag">Extra</span>
              </span>
              <span className="muted">
                Revision whenever you want it. It sits outside your four units, so nothing here
                changes your course progress.
              </span>
            </span>
          </button>
        ))}
      </main>

      <StudentNav />
    </>
  );
}
