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
      <div className="card">
        <p className="muted">
          There is no {isAssessment ? 'assessment' : 'activity'} in this unit yet.
        </p>
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="card stack">
        <h2 style={{ margin: 0 }}>{isAssessment ? 'Unit assessment' : 'Activity'}</h2>

        <p className="muted">
          {questionCount} question{questionCount === 1 ? '' : 's'}.{' '}
          {isAssessment && assessment
            ? `You need ${assessment.passMarkPercent}% to pass.`
            : 'You can try this as many times as you like.'}
        </p>

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
                    ? 'Try the assessment again'
                    : 'Start the assessment'
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

  return (
    <div className="stack">
      {finished ? (
        <div className="card stack" data-testid="activity-result">
          <h2 style={{ margin: 0 }}>Your result</h2>

          {attempt.passed !== null && attempt.passed !== undefined && (
            <p
              className={`badge ${attempt.passed ? 'active' : 'deleted'} result-verdict`}
              data-testid="assessment-verdict"
            >
              {attempt.passed ? 'Passed' : 'Not passed'}
            </p>
          )}

          <p style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
            <span data-testid="score-percent">{attempt.scorePercent}%</span>
          </p>
          <p className="muted" style={{ margin: 0 }}>
            {attempt.correctCount} right, {attempt.incorrectCount} wrong — {attempt.pointsAwarded}{' '}
            of {attempt.pointsAvailable} marks
            {typeof attempt.passMarkPercent === 'number'
              ? `. You needed ${attempt.passMarkPercent}%.`
              : '.'}
          </p>

          <div className="row">
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
              Back to the {isAssessment ? 'assessment' : 'activity'}
            </button>
          </div>

          <PastTries past={past} onOpen={openPast} isAssessment={isAssessment} />
        </div>
      ) : (
        <div className="card between">
          <p className="muted" style={{ margin: 0 }} data-testid="answered-count">
            {answered} of {attempt.questions.length} answered
          </p>
          <button
            className="primary"
            onClick={submit}
            disabled={busy}
            data-testid="submit-activity"
          >
            {busy ? 'Sending…' : 'Finish and see my score'}
          </button>
        </div>
      )}

      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}

      {attempt.questions.map((question, index) => (
        <QuestionCard
          key={question.answerId}
          question={question}
          number={index + 1}
          total={attempt.questions.length}
          finished={finished}
          response={responses[question.answerId]}
          onAnswer={(value) =>
            setResponses((current) => ({ ...current, [question.answerId]: value }))
          }
        />
      ))}

      {!finished && (
        <div className="row">
          <button
            className="primary"
            onClick={submit}
            disabled={busy}
            data-testid="submit-activity-bottom"
          >
            {busy ? 'Sending…' : 'Finish and see my score'}
          </button>
        </div>
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
      <h3 style={{ margin: 0, fontSize: '.95rem' }}>
        {isAssessment ? 'Your assessment attempts' : 'Your past tries'}
      </h3>
      <ul style={{ margin: 0, paddingInlineStart: 0, listStyle: 'none' }} data-testid="past-tries">
        {past.map((tryOut, index) => (
          <li key={tryOut.id} className="between" style={{ padding: '.4rem 0' }}>
            <span className="muted">
              Try {past.length - index}
              {tryOut.submittedAt
                ? ` · ${new Date(tryOut.submittedAt).toLocaleDateString('en-GB')}`
                : ''}{' '}
              · {tryOut.correctCount} right
            </span>
            <span className="row">
              {typeof tryOut.passed === 'boolean' && (
                <span
                  className={`badge ${tryOut.passed ? 'active' : 'deleted'}`}
                  data-testid="past-verdict"
                >
                  {tryOut.passed ? 'Passed' : 'Not passed'}
                </span>
              )}
              <strong data-testid="past-score">{tryOut.scorePercent}%</strong>
              <button className="small" onClick={() => onOpen(tryOut.id)} data-testid="open-past">
                See my answers
              </button>
            </span>
          </li>
        ))}
      </ul>
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
    already_passed: 'You have passed this assessment. Well done.',
    no_attempts_left: 'You have used all your tries for this assessment.',
    no_questions: 'Your teacher has not set an assessment for this unit yet.',
  } as const;

  return (
    <div className="stack" style={{ gap: '.4rem' }} data-testid="assessment-standing">
      <p className="muted" style={{ margin: 0 }}>
        <span data-testid="assessment-attempts">
          {assessment.attemptsUsed} of{' '}
          {assessment.maxAttempts === null ? 'unlimited' : assessment.maxAttempts} tries used
        </span>
        {assessment.bestScorePercent !== null && (
          <>
            {' · '}
            <span data-testid="assessment-best">best {assessment.bestScorePercent}%</span>
          </>
        )}
      </p>

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
    <div className="card stack" data-testid="activity-question" data-type={question.typeKey}>
      <div className="between">
        {/*
          Where she is, kept clear of the question itself. The imported text
          carries the worksheet's own numbering ("6) The jungle is …"), which
          is the curriculum's wording and is not ours to rewrite — but putting
          our count in front of it read as "1. 6)". The count moves here, and
          the question is shown exactly as the teacher approved it.
        */}
        <span className="muted" style={{ fontSize: '.8rem' }} data-testid="question-position">
          Question {number} of {total}
        </span>
        {finished && (
          <span className={`badge ${question.isCorrect ? 'active' : 'deleted'}`}>
            {question.isCorrect ? 'Right' : 'Wrong'}
          </span>
        )}
      </div>

      <strong style={{ display: 'block' }} data-testid="question-prompt">
        {question.prompt}
      </strong>

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
