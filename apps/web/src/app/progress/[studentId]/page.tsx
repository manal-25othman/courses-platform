'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  api,
  ApiError,
  homeFor,
  Me,
  StudentDetail,
  TeacherAttemptDetail,
  TeacherProfile,
  timeAgo,
} from '@/lib/api';
import { TeacherShell } from '@/components/TeacherShell';
import { Conversation } from '@/components/Conversation';
import { AttemptReview } from '@/components/AttemptReview';
import { Icon, type IconName } from '@/components/Icon';

/**
 * One student, as her teacher needs to read her.
 *
 * Opened from a row on Class Progress because something there wanted a look,
 * so this page answers the next question: what exactly is happening, and where
 * does she need help. It speaks the same language as the class list — the same
 * state words, the same amber for worth-a-look, the same mint for finished.
 *
 * Everything comes from `/progress/students/:id`, which is the progress
 * engine's own view of her work. Nothing here recalculates it and nothing here
 * writes to it: the only thing a teacher can change on this page is the
 * conversation, which is a message, not a mark.
 *
 * Her internal identifier is used to address the route and the API and is
 * never drawn. What the teacher sees is her name and her username.
 */

type StepState = 'done' | 'working' | 'stuck' | 'locked' | 'none';

interface Step {
  key: string;
  label: string;
  state: StepState;
}

type UnitOf = StudentDetail['units'][number];

const STEP_ICON: Partial<Record<StepState, IconName>> = {
  done: 'tick',
  stuck: 'lock',
  locked: 'lock',
};

/**
 * The four steps of a unit, in the order the course teaches them.
 *
 * Every state is one the server reports. `locked` is the sequence's own rule —
 * the grammar does not open until the words are done — and `stuck` is only
 * used where the assessment itself says she cannot go on: no tries left, or a
 * try taken that did not reach the mark. Nothing here is a judgement about
 * her, and nothing is predicted.
 */
function stepsOf(unit: UnitOf): Step[] {
  const p = unit.progress;
  const a = p.assessmentState;

  const vocabulary: Step = {
    key: 'Vocabulary',
    label: p.vocabulary.empty
      ? 'none set'
      : p.vocabulary.percent === 100
        ? 'finished'
        : `${p.vocabulary.done} of ${p.vocabulary.total}`,
    state: p.vocabulary.empty ? 'none' : p.vocabulary.percent === 100 ? 'done' : 'working',
  };

  const grammar: Step = {
    key: 'Grammar',
    label: p.grammar.empty
      ? 'none set'
      : p.grammarLock.locked
        ? 'opens after words'
        : p.grammar.percent === 100
          ? 'read'
          : `${p.grammar.done} of ${p.grammar.total}`,
    state: p.grammar.empty
      ? 'none'
      : p.grammar.percent === 100
        ? 'done'
        : p.grammarLock.locked
          ? 'locked'
          : 'working',
  };

  const activity: Step = {
    key: 'Activity',
    label: p.activity.empty
      ? 'none set'
      : p.bestScorePercent === null
        ? 'not tried'
        : `best ${p.bestScorePercent}%`,
    state: p.activity.empty ? 'none' : p.activity.percent === 100 ? 'done' : 'working',
  };

  const test: Step = {
    key: 'Test',
    label:
      a.questionCount === 0
        ? 'none set'
        : a.passed
          ? `passed ${a.bestScorePercent ?? 0}%`
          : a.blockedBecause === 'vocabulary_incomplete' || a.blockedBecause === 'grammar_incomplete'
            ? 'opens later'
            : a.blockedBecause === 'no_attempts_left'
              ? 'no tries left'
              : a.attemptsUsed > 0
                ? `not passed, best ${a.bestScorePercent ?? 0}%`
                : 'no attempt yet',
    state:
      a.questionCount === 0
        ? 'none'
        : a.passed
          ? 'done'
          : a.blockedBecause === 'vocabulary_incomplete' || a.blockedBecause === 'grammar_incomplete'
            ? 'locked'
            : a.blockedBecause === 'no_attempts_left' || a.attemptsUsed > 0
              ? 'stuck'
              : 'none',
  };

  return [vocabulary, grammar, activity, test];
}

/**
 * What, if anything, is worth the teacher's eye. Same rules as the class list.
 *
 * A student who has recorded nothing is not stuck on four separate units; she
 * has not begun. Saying it four times is the noise, not the signal.
 */
function worthALook(units: UnitOf[], everWorked: boolean): string[] {
  if (!everWorked) return [];
  const notes: string[] = [];
  for (const unit of units.filter((u) => u.progress.countsTowardCompletion)) {
    const a = unit.progress.assessmentState;
    if (!a.passed && a.blockedBecause === 'no_attempts_left') {
      notes.push(
        `${unit.title}: both tries used, best ${a.bestScorePercent ?? 0}% against a ${a.passMarkPercent}% pass mark.`,
      );
    } else if (!a.passed && a.attemptsUsed > 0) {
      notes.push(
        `${unit.title}: best ${a.bestScorePercent ?? 0}% so far, ${a.attemptsLeft ?? 0} ${
          (a.attemptsLeft ?? 0) === 1 ? 'try' : 'tries'
        } left.`,
      );
    } else if (
      unit.progress.grammarLock.locked &&
      !unit.progress.vocabulary.empty &&
      unit.progress.vocabulary.percent < 100
    ) {
      notes.push(
        `${unit.title}: ${unit.progress.vocabulary.done} of ${unit.progress.vocabulary.total} words done, so the grammar has not opened.`,
      );
    }
  }
  return notes;
}

export default function StudentProgressPage() {
  const router = useRouter();
  const params = useParams<{ studentId: string }>();
  // Used to address the API and nothing else: it is never rendered.
  const studentId = params.studentId;

  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [paper, setPaper] = useState<TeacherAttemptDetail | null>(null);
  const [openUnit, setOpenUnit] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; missing: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await api.get<StudentDetail>(`/progress/students/${studentId}`));
      setError(null);
    } catch (caught) {
      // A student who is not this teacher's, and a student who does not exist,
      // are deliberately the same answer from the server. Both are shown as
      // "not on your list" — the page never says whether she exists elsewhere.
      const missing = caught instanceof ApiError && caught.status === 404;
      setDetail(null);
      setError({
        message:
          caught instanceof ApiError && !missing
            ? caught.message
            : missing
              ? 'That student is not on your list.'
              : 'This student could not be loaded.',
        missing,
      });
    }
  }, [studentId]);

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
    if (!me) return;
    api.get<TeacherProfile>('/teachers/me').then(setProfile).catch(() => setProfile(null));
  }, [me]);

  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  /** Opens one finished paper, exactly as the student was given it. */
  async function openPaper(attemptId: string) {
    try {
      setPaper(await api.get<TeacherAttemptDetail>(`/progress/attempts/${attemptId}`));
    } catch (caught) {
      setError({
        message: caught instanceof ApiError ? caught.message : 'That paper could not be opened.',
        missing: false,
      });
    }
  }

  if (!me) {
    return (
      <main className="page">
        <div className="skeleton" style={{ height: '2rem', width: '12rem' }} />
        <div className="skeleton" style={{ height: '14rem', marginTop: '1.5rem' }} />
      </main>
    );
  }

  const back = (
    <button className="crumb" onClick={() => router.push('/progress')} data-testid="back">
      <Icon name="back" size={15} />
      Class progress
    </button>
  );

  if (error) {
    return (
      <TeacherShell me={me} teacherTitle={profile?.title} title="Student" lead={back}>
        <div className="panel">
          <div className="blank">
            <span className="mark" aria-hidden="true">
              <Icon name={error.missing ? 'lock' : 'teacher'} size={22} />
            </span>
            <strong>{error.message}</strong>
            <p>
              {error.missing
                ? 'Only the students on your own list can be opened from here.'
                : 'Nothing was loaded. This is usually temporary.'}
            </p>
            <div className="row" style={{ justifyContent: 'center' }}>
              {!error.missing && (
                <button className="primary" onClick={() => void load()} data-testid="retry">
                  Try again
                </button>
              )}
              <button onClick={() => router.push('/progress')}>Back to class progress</button>
            </div>
          </div>
        </div>
      </TeacherShell>
    );
  }

  if (!detail) {
    return (
      <TeacherShell me={me} teacherTitle={profile?.title} title="Student" lead={back}>
        <div className="panel">
          <div className="panel-body stack">
            <div className="skeleton" style={{ height: '4rem' }} />
            <div className="skeleton" style={{ height: '3rem' }} />
            <div className="skeleton" style={{ height: '3rem' }} />
          </div>
        </div>
      </TeacherShell>
    );
  }

  const core = detail.units.filter((u) => u.progress.countsTowardCompletion);
  const extra = detail.units.filter((u) => !u.progress.countsTowardCompletion);
  const notes = worthALook(detail.units, detail.lastActivityAt !== null);

  return (
    <TeacherShell me={me} teacherTitle={profile?.title} title={detail.fullName} lead={back}>
      <div className="stack">
        {/* ------------------------------------------------------ who she is */}
        <section className="panel">
          <div className="panel-body pupil">
            {/* Her name and username only. The internal identifier that
                addresses this page is never shown. */}
            <span className="avatar" aria-hidden="true">
              {detail.fullName.trim().charAt(0).toUpperCase()}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: 'var(--fs-lead)' }}>
                {detail.fullName}
              </strong>
              <span className="muted">{detail.username}</span>
            </div>
            <div className="pupil-facts">
              <span className="fact">
                <b>{detail.overallPercent}%</b>
                <span>of the course</span>
              </span>
              <span className="fact">
                <b>
                  {detail.unitsComplete}
                  <span style={{ color: 'var(--ink-3)' }}>/{detail.unitsCounted}</span>
                </b>
                <span>units finished</span>
              </span>
              <span className="fact">
                <b style={{ fontSize: 'var(--fs-base)' }}>{timeAgo(detail.lastActivityAt)}</b>
                <span>last worked</span>
              </span>
              <span className="fact">
                <b style={{ fontSize: 'var(--fs-base)' }}>{timeAgo(detail.lastLoginAt)}</b>
                <span>last signed in</span>
              </span>
            </div>
          </div>
        </section>

        {/* A student who has not begun: said once, plainly, in place of a
            list of units she is equally not stuck on. */}
        {detail.lastActivityAt === null && (
          <section className="panel" data-testid="not-started">
            <div className="panel-body">
              <p className="note-line">
                {detail.fullName.split(' ')[0]} has not recorded any work yet. Her units below
                show what is waiting for her.
              </p>
            </div>
          </section>
        )}

        {/* --------------------------------------------------- worth a look */}
        {notes.length > 0 && (
          <section className="panel" data-testid="worth-a-look">
            <div className="panel-head">
              <h2 className="panel-title">Worth a look</h2>
              <span className="panel-note">From her recorded work</span>
            </div>
            <div className="panel-body">
              <ul className="stack" style={{ margin: 0, paddingInlineStart: '1.1rem' }}>
                {notes.map((note) => (
                  <li key={note} className="note-line">
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* -------------------------------------------------- the four units */}
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Course</h2>
            <span className="panel-note">Open a unit to see the detail</span>
          </div>
          {core.map((unit) => (
            <UnitBlock
              key={unit.unitId}
              unit={unit}
              open={openUnit === unit.unitId}
              onToggle={() => setOpenUnit(openUnit === unit.unitId ? null : unit.unitId)}
              onPaper={openPaper}
            />
          ))}
        </section>

        {/* Supplementary, and said so: it is not a fifth required unit and it
            does not move her course figure. */}
        {extra.length > 0 && (
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Extra practice</h2>
              <span className="panel-note">Not part of the four course units</span>
            </div>
            {extra.map((unit) => (
              <UnitBlock
                key={unit.unitId}
                unit={unit}
                open={openUnit === unit.unitId}
                onToggle={() => setOpenUnit(openUnit === unit.unitId ? null : unit.unitId)}
                onPaper={openPaper}
              />
            ))}
          </section>
        )}

        {paper && <AttemptReview attempt={paper} onClose={() => setPaper(null)} />}

        {/* ------------------------------------------------- the conversation */}
        <section className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Messages</h2>
            <span className="panel-note">Only you and {detail.fullName.split(' ')[0]}</span>
          </div>
          <div className="panel-body">
            <Conversation
              bare
              loadPath={`/messages/students/${studentId}`}
              sendPath={`/messages/students/${studentId}`}
              readPath={`/messages/students/${studentId}/read`}
              placeholder="Write feedback for this student…"
              emptyText="No messages yet. Write the first one below."
            />
          </div>
        </section>
      </div>
    </TeacherShell>
  );
}

/** One unit: shut it is a line, open it is the detail behind that line. */
function UnitBlock({
  unit,
  open,
  onToggle,
  onPaper,
}: {
  unit: UnitOf;
  open: boolean;
  onToggle: () => void;
  onPaper: (id: string) => void;
}) {
  const p = unit.progress;
  const steps = stepsOf(unit);
  const learned = unit.words.filter((w) => w.learned).length;

  return (
    <div className="unit-row" data-testid="student-unit">
      <button
        className="unit-open"
        aria-expanded={open}
        onClick={onToggle}
        data-testid="unit-toggle"
      >
        <span className="title">{unit.title}</span>
        <span className="meter" aria-hidden="true">
          <span style={{ width: `${p.overallPercent}%` }} />
        </span>
        <span className="pct num" data-testid="unit-overall">
          {p.overallPercent}%
        </span>
        <span className="steps">
          {steps.map((step) => (
            <span className="step" key={step.key} data-state={step.state}>
              {STEP_ICON[step.state] && <Icon name={STEP_ICON[step.state] as IconName} />}
              {step.key} {step.label}
            </span>
          ))}
        </span>
        <Icon name="back" className="ico" size={15} />
      </button>

      {open && (
        <div className="unit-detail" data-testid="unit-detail">
          {/* Parts the teacher has not built yet, which is why the unit cannot
              reach 100% however much work the student does. */}
          {p.missingContent.length > 0 && (
            <section>
              <p className="note-line" data-testid="unit-not-ready">
                This unit is still missing its {p.missingContent.join(', ')}, so it cannot reach
                100% yet.
              </p>
            </section>
          )}

          <section>
            <h3 className="detail-head">Test</h3>
            <p className="note-line" data-testid="assessment-state">
              {p.assessmentState.questionCount === 0
                ? 'No test has been set for this unit yet.'
                : p.assessmentState.passed
                  ? `Passed with ${p.assessmentState.bestScorePercent}%, against a ${p.assessmentState.passMarkPercent}% pass mark. ${p.assessmentState.attemptsUsed} of ${p.assessmentState.maxAttempts ?? '∞'} tries used.`
                  : p.assessmentState.blockedBecause === 'vocabulary_incomplete'
                    ? 'The test opens once she has finished the words for this unit.'
                    : p.assessmentState.blockedBecause === 'grammar_incomplete'
                      ? 'The test opens once she has read the grammar for this unit.'
                      : p.assessmentState.attemptsUsed === 0
                        ? `Not attempted yet. ${p.assessmentState.questionCount} questions, ${p.assessmentState.passMarkPercent}% to pass, ${p.assessmentState.maxAttempts ?? '∞'} tries.`
                        : `Best ${p.assessmentState.bestScorePercent ?? 0}% against a ${p.assessmentState.passMarkPercent}% pass mark. ${p.assessmentState.attemptsUsed} of ${p.assessmentState.maxAttempts ?? '∞'} tries used${p.assessmentState.blockedBecause === 'no_attempts_left' ? ', none left' : `, ${p.assessmentState.attemptsLeft ?? 0} left`}.`}
            </p>
          </section>

          {unit.words.length > 0 && (
            <section>
              <h3 className="detail-head">
                Words — {learned} of {unit.words.length} learned
              </h3>
              {/* Read, heard and checked are the three steps that finish a
                  word. Each mark is labelled, so the state is never colour
                  alone. */}
              <div className="words-grid">
                {unit.words.map((word) => (
                  <span
                    className="word-row"
                    key={word.id}
                    data-learned={word.learned}
                    data-testid="word-row"
                  >
                    <span className="en">{word.wordEn}</span>
                    <span className="wdots">
                      {(
                        [
                          ['R', 'Read', word.seen],
                          ['H', 'Heard', word.audioPlayed],
                          ['C', 'Checked', word.checked],
                        ] as const
                      ).map(([letter, name, on]) => (
                        <span
                          className="wdot"
                          key={letter}
                          data-on={on}
                          title={`${name}: ${on ? 'yes' : 'not yet'}`}
                        >
                          <span aria-hidden="true">{letter}</span>
                          <span className="sr-only">{`${name} ${on ? 'done' : 'not done'}`}</span>
                        </span>
                      ))}
                    </span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {unit.attempts.length > 0 && (
            <section>
              <h3 className="detail-head">Papers she has finished</h3>
              <ul className="papers" data-testid="attempt-list">
                {unit.attempts.map((attempt) => (
                  <li className="paper" key={attempt.id}>
                    <span className="score">{attempt.scorePercent}%</span>
                    <span className="what">
                      <span style={{ fontWeight: 600, fontSize: 'var(--fs-small)' }}>
                        {attempt.purpose === 'ASSESSMENT' ? 'Unit test' : 'Activity'}
                        {attempt.purpose === 'ASSESSMENT' &&
                          (attempt.passed ? ' — passed' : ' — not passed')}
                      </span>
                      <span className="muted">
                        {attempt.correctCount} right, {attempt.incorrectCount} wrong
                        {attempt.submittedAt &&
                          `, ${new Date(attempt.submittedAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                          })}`}
                      </span>
                    </span>
                    {/*
                      The score alone does not say what to teach next. This
                      opens the paper as she sat it: which questions she got
                      wrong, and what she answered.
                    */}
                    <button
                      className="small"
                      onClick={() => onPaper(attempt.id)}
                      data-testid="open-attempt"
                    >
                      See her answers
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
