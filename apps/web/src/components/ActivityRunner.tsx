'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  AssessmentState,
  Attempt,
  AttemptQuestion,
  AttemptSummary,
} from '@/lib/api';
import { QuestionBody, QuestionPictures } from './QuestionViews';
import { Icon } from './Icon';

/**
 * The activity, and the unit's assessment.
 *
 * The questions, their order and the order of their choices all come from the
 * API, which took them from the engine and froze them into this attempt. This
 * screen shows what it is given and sends back what she picked; it holds no
 * answers and decides nothing about marking.
 *
 * One component serves both because for a student they are the same act:
 * answer the questions, send them, see the result. What differs is what the
 * screen says around it — practice can be repeated as often as she likes
 * (SRS 9), while an assessment has a limited number of tries and a mark to
 * reach (SRS 17, 18). Those rules are the API's; this reads them off the
 * `assessment` it is handed and never decides one itself.
 */
export function ActivityRunner({
  unitId,
  questionCount,
  mode = 'activity',
  assessment,
  onFinished,
}: {
  unitId: string;
  questionCount: number;
  mode?: 'activity' | 'assessment';
  /** How the assessment stands for her. Required in assessment mode. */
  assessment?: AssessmentState;
  onFinished: () => Promise<void> | void;
}) {
  const isAssessment = mode === 'assessment';
  const startPath = isAssessment
    ? `/learn/units/${unitId}/assessment`
    : `/learn/units/${unitId}/activity`;
  const attemptsPath = isAssessment
    ? `/learn/units/${unitId}/assessment/attempts`
    : `/learn/units/${unitId}/attempts`;
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  /**
   * How many assessment tries were used when this one started.
   *
   * The result appears the moment the marking comes back, a beat before the
   * page has refetched how the assessment now stands. Without this, that beat
   * showed "Try again" after her last try — a button the API would refuse.
   * Comparing against the count at the start says whether what is on screen
   * has caught up yet.
   */
  const [attemptsAtStart, setAttemptsAtStart] = useState<number | null>(null);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [past, setPast] = useState<AttemptSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Which question is showing while she answers.
   *
   * Answering happens one question at a time — a phone cannot hold twenty-one
   * of them and asking her to scroll past the ones she has done is not a
   * quiz, it is a form. Reviewing a finished attempt still shows the whole
   * paper, because that is when seeing every mark at once is the point.
   *
   * Nothing about submission changes: every answer is still sent together in
   * one call at the end, exactly as before.
   */
  const [cursor, setCursor] = useState(0);

  const loadPast = useCallback(async () => {
    const list = await api
      .get<AttemptSummary[]>(attemptsPath)
      .catch(() => [] as AttemptSummary[]);
    setPast(list);
  }, [attemptsPath]);

  useEffect(() => {
    void loadPast();
  }, [loadPast]);

  /**
   * Opens a try she has already finished.
   *
   * What comes back is the paper she was given at the time, not the unit as it
   * stands now — so a question her teacher has corrected since still reads the
   * way it did when she answered it.
   */
  async function openPast(id: string) {
    setBusy(true);
    setError(null);
    try {
      const finished = await api.get<Attempt>(`/learn/attempts/${id}`);
      setAttempt(finished);
      const existing: Record<string, unknown> = {};
      for (const question of finished.questions) {
        if (question.response !== null && question.response !== undefined) {
          existing[question.answerId] = question.response;
        }
      }
      setResponses(existing);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not open that try.');
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      setAttemptsAtStart(assessment?.attemptsUsed ?? 0);
      const started = await api.post<Attempt>(startPath);
      setAttempt(started);
      setCursor(0);
      // An attempt resumed after closing the page brings her answers back.
      const existing: Record<string, unknown> = {};
      for (const question of started.questions) {
        if (question.response !== null && question.response !== undefined) {
          existing[question.answerId] = question.response;
        }
      }
      setResponses(existing);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : `Could not start the ${isAssessment ? 'assessment' : 'activity'}.`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!attempt) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<Attempt>(`/learn/attempts/${attempt.id}/submit`, {
        responses,
      });
      setAttempt(result);
      await loadPast();
      await onFinished();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not send your answers.');
    } finally {
      setBusy(false);
    }
  }

  if (questionCount === 0) {
    return (
      <div className="locked-note">
        <Icon name={isAssessment ? 'assessment' : 'activity'} />
        <div>
          <strong>Nothing to answer here yet</strong>
          <p className="muted" style={{ margin: '.25rem 0 0' }}>
            Your teacher is still writing the{' '}
            {isAssessment ? 'test' : 'activity'} for this unit.
          </p>
        </div>
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="card stack">
        {/*
          The rules, as figures rather than a sentence. What she wants to know
          before she starts is how long it is and what it takes to pass, and
          those are numbers — so they are set as numbers.
        */}
        {isAssessment && assessment ? (
          <dl className="exam-rules" data-testid="exam-rules">
            <div className="exam-rule">
              <b className="num">{questionCount}</b>
              <span>question{questionCount === 1 ? '' : 's'}</span>
            </div>
            <div className="exam-rule">
              <b className="num">{assessment.passMarkPercent}%</b>
              <span>to pass</span>
            </div>
            <div className="exam-rule">
              <b className="num">
                {assessment.maxAttempts === null
                  ? '∞'
                  : assessment.maxAttempts - assessment.attemptsUsed}
              </b>
              <span>
                {assessment.maxAttempts === null
                  ? 'tries'
                  : `of ${assessment.maxAttempts} tries left`}
              </span>
            </div>
          </dl>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            {questionCount} question{questionCount === 1 ? '' : 's'}. Practise as often as you
            like — this does not count towards your test.
          </p>
        )}

        {isAssessment && assessment && <AssessmentStanding assessment={assessment} />}

        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}

        {/*
          A blocked assessment has no button at all rather than a greyed-out
          one. The message above already says why she cannot sit it; offering
          a dead "Try again" beside "You have passed this assessment" reads
          like something has gone wrong.
        */}
        {(!isAssessment || (assessment?.canStart ?? true)) && (
          <div className="row">
            <button
              className="primary"
              onClick={start}
              disabled={busy}
              data-testid={isAssessment ? 'start-assessment' : 'start-activity'}
            >
              {busy
                ? 'Starting…'
                : isAssessment
                  ? assessment && assessment.attemptsUsed > 0
                    ? 'Try the test again'
                    : 'Start the test'
                  : 'Start the activity'}
            </button>
          </div>
        )}

        <PastTries past={past} onOpen={openPast} isAssessment={isAssessment} />
      </div>
    );
  }

  const finished = attempt.status === 'SUBMITTED';
  const answered = Object.keys(responses).length;
  const total = attempt.questions.length;
  const at = Math.min(cursor, total - 1);
  const question = attempt.questions[at];
  const done = responses[question?.answerId] !== undefined;
  const allAnswered = answered === total;

  /* ----------------------------------------------------------------- review
     A finished paper is shown whole: every question, every mark, in order.
     ------------------------------------------------------------------ */
  if (finished) {
    return (
      <div className="stack">
        <div className="card stack result-panel" data-testid="activity-result">
          {/*
            One orchestrated moment, and only for a real milestone: passing the
            unit's assessment. Practice never gets it, and a reduced-motion
            setting turns it off in CSS.
          */}
          {attempt.passed === true && <Confetti />}

          <ScoreRing percent={attempt.scorePercent ?? 0} passed={attempt.passed} />

          <p className="result-line">
            {attempt.passed === true
              ? 'You passed.'
              : attempt.passed === false
                ? 'Not passed this time.'
                : `${attempt.correctCount ?? 0} of ${total} right.`}
          </p>

          {attempt.passed !== null && attempt.passed !== undefined && (
            <span hidden data-testid="assessment-verdict">
              {attempt.passed ? 'Passed' : 'Not passed'}
            </span>
          )}

          <p className="muted" style={{ margin: 0 }}>
            {attempt.correctCount} right and {attempt.incorrectCount} wrong,{' '}
            {attempt.pointsAwarded} of {attempt.pointsAvailable} marks
            {typeof attempt.passMarkPercent === 'number'
              ? `. You needed ${attempt.passMarkPercent}% to pass.`
              : '.'}
          </p>

          <div className="row" style={{ justifyContent: 'center' }}>
            {/*
              Whether another try is allowed is the API's decision, not this
              screen's: an assessment has a limited number and a pass ends it.
              The button is only offered when it would work.
            */}
            {(!isAssessment ||
              (assessment !== undefined &&
                attemptsAtStart !== null &&
                assessment.attemptsUsed > attemptsAtStart &&
                assessment.canStart)) && (
              <button
                className="primary"
                onClick={() => {
                  setAttempt(null);
                  setResponses({});
                  void start();
                }}
                data-testid="try-again"
              >
                Try again
              </button>
            )}
            <button
              onClick={() => {
                setAttempt(null);
                setResponses({});
                void loadPast();
              }}
              data-testid="back-to-activity"
            >
              Back to the {isAssessment ? 'test' : 'activity'}
            </button>
          </div>

          <PastTries past={past} onOpen={openPast} isAssessment={isAssessment} />
        </div>

        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}

        {attempt.questions.map((q, index) => (
          <QuestionCard
            key={q.answerId}
            question={q}
            number={index + 1}
            total={total}
            finished
            response={responses[q.answerId]}
            onAnswer={() => undefined}
          />
        ))}
      </div>
    );
  }

  /* ------------------------------------------------------------- answering
     One question, filling the screen, with the run of them above it.
     ------------------------------------------------------------------ */
  return (
    <div className="stack">
      <div className="running">
        <div className="running-in">
          {/* Every question, its state, and a way back to any of them. */}
          <div className="q-pips" role="tablist" aria-label="Questions">
            {attempt.questions.map((q, n) => (
              <button
                key={q.answerId}
                className="q-pip"
                role="tab"
                aria-selected={n === at}
                aria-current={n === at}
                aria-label={`Question ${n + 1}${responses[q.answerId] !== undefined ? ', answered' : ''}`}
                data-answered={responses[q.answerId] !== undefined}
                onClick={() => setCursor(n)}
              />
            ))}
          </div>
          <p className="muted" style={{ margin: 0 }} data-testid="answered-count">
            {answered} of {total} answered
          </p>
        </div>
      </div>

      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}

      <QuestionCard
        key={question.answerId}
        question={question}
        number={at + 1}
        total={total}
        finished={false}
        response={responses[question.answerId]}
        onAnswer={(value) =>
          setResponses((current) => ({ ...current, [question.answerId]: value }))
        }
      />

      <div className="q-move">
        <button className="ghost" onClick={() => setCursor(at - 1)} disabled={at === 0}>
          <Icon name="back" />
          Back
        </button>

        {at < total - 1 ? (
          <button
            className={done ? 'primary' : 'ghost'}
            onClick={() => setCursor(at + 1)}
            data-testid="next-question"
          >
            {done ? 'Next' : 'Skip'}
            <Icon name="back" className="ico flip" />
          </button>
        ) : (
          <button
            className="primary"
            onClick={submit}
            disabled={busy}
            data-testid="submit-activity"
          >
            {busy ? 'Sending…' : 'Finish and see my score'}
          </button>
        )}
      </div>

      {/*
        On the last question the Finish button is already there. Everywhere
        else it appears only once nothing is outstanding, so she is never
        invited to hand in a half-finished paper by accident — but is never
        forced to walk to the end either.
      */}
      {allAnswered && at < total - 1 && (
        <button
          className="signal"
          onClick={submit}
          disabled={busy}
          data-testid="submit-activity-bottom"
          style={{ width: '100%' }}
        >
          {busy ? 'Sending…' : 'Finish and see my score'}
        </button>
      )}
    </div>
  );
}

/**
 * The tries she has already finished.
 *
 * Opening one shows the questions exactly as they were put to her, which is
 * why a correction her teacher makes afterwards never changes a mark she has
 * already been given.
 */
function PastTries({
  past,
  onOpen,
  isAssessment = false,
}: {
  past: AttemptSummary[];
  onOpen: (id: string) => void;
  isAssessment?: boolean;
}) {
  if (past.length === 0) return null;

  return (
    <div className="stack" style={{ marginTop: '.5rem' }}>
      <h3 className="marked-title" style={{ margin: 0, fontSize: 'var(--fs-base)' }}>
        {isAssessment ? 'Your tries at the test' : 'Your past tries'}
      </h3>
      {/*
        A try is a row of facts, not a sentence of them strung together. The
        score leads because that is what she came to look at; the date is the
        quietest thing on the row because it is the least useful.
      */}
      <ul className="tries" data-testid="past-tries">
        {past.map((tryOut, index) => (
          <li key={tryOut.id} className="try">
            <span className="try-score num" data-testid="past-score">
              {tryOut.scorePercent}%
            </span>
            <span className="try-what">
              <span className="try-no">Try {past.length - index}</span>
              <span className="muted">
                {tryOut.correctCount} right
                {tryOut.submittedAt
                  ? `, ${new Date(tryOut.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                  : ''}
              </span>
            </span>
            {typeof tryOut.passed === 'boolean' && (
              <span
                className={`mark ${tryOut.passed ? 'tick' : 'cross'}`}
                title={tryOut.passed ? 'Passed' : 'Not passed'}
                data-testid="past-verdict"
              >
                <Icon name={tryOut.passed ? 'tick' : 'cross'} />
                <span hidden>{tryOut.passed ? 'Passed' : 'Not passed'}</span>
              </span>
            )}
            <button className="small" onClick={() => onOpen(tryOut.id)} data-testid="open-past">
              See my answers
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The score, drawn.
 *
 * A percentage is the one number she actually reads on this screen, so it is
 * given the space to be read: the ring is the figure, not a decoration around
 * it. The ring fills to the score, which is the only entrance animation on the
 * page and answers something she just did.
 */
function ScoreRing({ percent, passed }: { percent: number; passed?: boolean | null }) {
  const r = 62;
  const circumference = 2 * Math.PI * r;
  const kind = passed === true ? 'done' : passed === false ? 'wrong' : 'vocabulary';
  return (
    <div className="score-ring" data-kind={kind === 'wrong' ? undefined : kind}>
      <svg viewBox="0 0 144 144" aria-hidden="true">
        <circle className="track" cx="72" cy="72" r={r} fill="none" strokeWidth="12" />
        <circle
          className="fill"
          cx="72"
          cy="72"
          r={r}
          fill="none"
          strokeWidth="12"
          style={passed === false ? { stroke: 'var(--bad)' } : undefined}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.max(0, Math.min(100, percent)) / 100)}
        />
      </svg>
      <span className="value">
        <span className="v">
          <span data-testid="score-percent">{percent}</span>
          <span className="pc">%</span>
        </span>
      </span>
    </div>
  );
}

/**
 * A short burst of paper, for passing a unit's test and nothing else.
 *
 * Kept to a fixed set of pieces so it costs nothing to run, and removed from
 * the tree once it has landed. `prefers-reduced-motion` hides it in CSS.
 */
function Confetti() {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setGone(true), 2000);
    return () => clearTimeout(timer);
  }, []);
  if (gone) return null;
  const colours = ['var(--signal)', 'var(--brand)', 'var(--assess)', 'var(--activity)', 'var(--games)'];
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${(i * 37) % 100}%`,
            background: colours[i % colours.length],
            animationDelay: `${(i % 7) * 90}ms`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * How her assessment stands: the mark, the tries and why she may not start.
 *
 * Every number here comes from the API. Nothing on this screen decides
 * whether she may sit it — it says what she was told.
 */
function AssessmentStanding({ assessment }: { assessment: AssessmentState }) {
  const blocked = {
    already_passed: 'You have passed this test. Well done.',
    no_attempts_left: 'You have used all your tries for this test.',
    no_questions: 'Your teacher has not set a test for this unit yet.',
    // The two the sequence adds. Both name the thing she can go and do.
    vocabulary_incomplete: 'Learn all the words in this unit first, then the test opens.',
    grammar_incomplete: 'Read the grammar for this unit first, then the test opens.',
  } as const;

  return (
    <div className="stack" style={{ gap: '.4rem' }} data-testid="assessment-standing">
      {/*
        Only worth saying once she has actually sat it. Before that the rules
        above already carry the tries, and repeating them reads as a warning.
      */}
      {assessment.attemptsUsed > 0 && (
        <p className="muted" style={{ margin: 0 }}>
          <span data-testid="assessment-attempts">
            {assessment.attemptsUsed} of{' '}
            {assessment.maxAttempts === null ? 'unlimited' : assessment.maxAttempts} tries used
          </span>
          {assessment.bestScorePercent !== null && (
            <>
              {', '}
              <span data-testid="assessment-best">best {assessment.bestScorePercent}%</span>
            </>
          )}
        </p>
      )}

      {assessment.blockedBecause && (
        <p
          className={`alert ${assessment.blockedBecause === 'already_passed' ? 'ok' : 'warn'}`}
          role="status"
          data-testid="assessment-blocked"
        >
          {blocked[assessment.blockedBecause]}
        </p>
      )}
    </div>
  );
}

/**
 * One question.
 *
 * The card is the same for every kind — where she is, the wording she was
 * given, any picture that came with it, and whether it was right. What sits
 * inside follows the kind, and that lives in QuestionViews.
 */
function QuestionCard({
  question,
  number,
  total,
  finished,
  response,
  onAnswer,
}: {
  question: AttemptQuestion;
  number: number;
  total: number;
  finished: boolean;
  response: unknown;
  onAnswer: (value: unknown) => void;
}) {
  return (
    <div
      className="card stack q-card"
      data-testid="activity-question"
      data-type={question.typeKey}
      data-marked={finished ? (question.isCorrect ? 'right' : 'wrong') : undefined}
    >
      <div className="between">
        {/*
          Where she is, kept clear of the question itself. The imported text
          carries the worksheet's own numbering ("6) The jungle is …"), which
          is the curriculum's wording and is not ours to rewrite — but putting
          our count in front of it read as "1. 6)". The count moves here, and
          the question is shown exactly as the teacher approved it.
        */}
        <span className="q-no num" data-testid="question-position">
          Question {number} of {total}
        </span>
        {finished && (
          /* Marked the way her paper is marked, rather than with another word. */
          <span className={`mark ${question.isCorrect ? 'tick' : 'cross'}`}>
            <Icon name={question.isCorrect ? 'tick' : 'cross'} />
            <span hidden>{question.isCorrect ? 'Right' : 'Wrong'}</span>
          </span>
        )}
      </div>

      <p className="q-prompt" data-testid="question-prompt">
        {question.prompt}
      </p>

      <QuestionPictures question={question} />

      <QuestionBody
        question={question}
        finished={finished}
        response={response}
        onAnswer={onAnswer}
      />
    </div>
  );
}
