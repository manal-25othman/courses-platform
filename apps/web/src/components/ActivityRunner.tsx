'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, Attempt, AttemptQuestion, AttemptSummary } from '@/lib/api';

/**
 * The activity.
 *
 * The questions, their order and the order of their choices all come from the
 * API, which took them from the engine and froze them into this attempt. This
 * screen shows what it is given and sends back what she picked; it holds no
 * answers and decides nothing about marking.
 *
 * Retries are unlimited (SRS 9), so finishing shows the result and offers
 * another go.
 */
export function ActivityRunner({
  unitId,
  questionCount,
  onFinished,
}: {
  unitId: string;
  questionCount: number;
  onFinished: () => Promise<void> | void;
}) {
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [responses, setResponses] = useState<Record<string, unknown>>({});
  const [past, setPast] = useState<AttemptSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPast = useCallback(async () => {
    const list = await api
      .get<AttemptSummary[]>(`/learn/units/${unitId}/attempts`)
      .catch(() => [] as AttemptSummary[]);
    setPast(list);
  }, [unitId]);

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
      const started = await api.post<Attempt>(`/learn/units/${unitId}/activity`);
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
      setError(caught instanceof ApiError ? caught.message : 'Could not start the activity.');
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
        <p className="muted">There is no activity in this unit yet.</p>
      </div>
    );
  }

  if (!attempt) {
    return (
      <div className="card stack">
        <h2 style={{ margin: 0 }}>Activity</h2>
        <p className="muted">
          {questionCount} question{questionCount === 1 ? '' : 's'}. You can try this as many times
          as you like.
        </p>
        {error && (
          <p className="alert error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="primary" onClick={start} disabled={busy} data-testid="start-activity">
            {busy ? 'Starting…' : 'Start the activity'}
          </button>
        </div>

        <PastTries past={past} onOpen={openPast} />
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
          <p style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0 }}>
            <span data-testid="score-percent">{attempt.scorePercent}%</span>
          </p>
          <p className="muted" style={{ margin: 0 }}>
            {attempt.correctCount} right, {attempt.incorrectCount} wrong — {attempt.pointsAwarded}{' '}
            of {attempt.pointsAvailable} marks.
          </p>
          <div className="row">
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
            <button
              onClick={() => {
                setAttempt(null);
                setResponses({});
                void loadPast();
              }}
              data-testid="back-to-activity"
            >
              Back to the activity
            </button>
          </div>

          <PastTries past={past} onOpen={openPast} />
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
}: {
  past: AttemptSummary[];
  onOpen: (id: string) => void;
}) {
  if (past.length === 0) return null;

  return (
    <div className="stack" style={{ marginTop: '.5rem' }}>
      <h3 style={{ margin: 0, fontSize: '.95rem' }}>Your past tries</h3>
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

/** One question. What it looks like follows its kind, which the API names. */
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
  const options = Array.isArray(question.payload?.options)
    ? (question.payload.options as { id: string; text: string }[])
    : [];

  const picked =
    response && typeof response === 'object' && 'optionId' in response
      ? String((response as { optionId: unknown }).optionId)
      : null;

  const pickedBool =
    response && typeof response === 'object' && 'value' in response
      ? Boolean((response as { value: unknown }).value)
      : null;

  const expectedOption =
    question.expected && typeof question.expected.correctOptionId === 'string'
      ? question.expected.correctOptionId
      : null;

  const expectedBool =
    question.expected && typeof question.expected.value === 'boolean'
      ? question.expected.value
      : null;

  function classFor(isThisOne: boolean, isCorrectOne: boolean): string {
    if (!finished) return isThisOne ? 'choice picked' : 'choice';
    if (isCorrectOne) return 'choice right';
    if (isThisOne) return 'choice wrong';
    return 'choice';
  }

  return (
    <div className="card stack" data-testid="activity-question">
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

      {options.length > 0 && (
        <div className="stack" style={{ gap: '.4rem' }}>
          {options.map((option) => (
            <label
              key={option.id}
              className={classFor(picked === option.id, expectedOption === option.id)}
              style={{ margin: 0, fontWeight: 400 }}
            >
              <input
                type="radio"
                name={question.answerId}
                checked={picked === option.id}
                disabled={finished}
                onChange={() => onAnswer({ optionId: option.id })}
                data-testid={`option-${question.answerId}-${option.id}`}
              />
              <span>{option.text}</span>
            </label>
          ))}
        </div>
      )}

      {options.length === 0 && question.typeKey === 'true_false' && (
        <div className="row">
          {[true, false].map((value) => (
            <label
              key={String(value)}
              className={classFor(pickedBool === value, expectedBool === value)}
              style={{ margin: 0, fontWeight: 400 }}
            >
              <input
                type="radio"
                name={question.answerId}
                checked={pickedBool === value}
                disabled={finished}
                onChange={() => onAnswer({ value })}
                data-testid={`tf-${question.answerId}-${value}`}
              />
              <span>{value ? 'True' : 'False'}</span>
            </label>
          ))}
        </div>
      )}

      {options.length === 0 && question.typeKey !== 'true_false' && (
        <label style={{ fontWeight: 400 }}>
          Your answer
          <input
            type="text"
            disabled={finished}
            defaultValue={
              response && typeof response === 'object' && 'text' in response
                ? String((response as { text: unknown }).text)
                : ''
            }
            onChange={(e) => onAnswer({ text: e.target.value })}
            data-testid={`typed-${question.answerId}`}
          />
        </label>
      )}
    </div>
  );
}
