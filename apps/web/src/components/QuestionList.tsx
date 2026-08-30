'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api,
  choicesOf,
  correctChoiceId,
  Choice,
  Question,
  ReviewSummary,
} from '@/lib/api';

/**
 * The teacher's questions for one unit.
 *
 * This exists because the questions were read out of a Word file, and some of
 * what came out is wrong. She has to be able to fix the wording, the choices
 * and above all the correct answer, and to do it here rather than by asking
 * for a code change.
 */
export function QuestionList({
  unitId,
  onRun,
}: {
  unitId: string;
  onRun: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [onlyReview, setOnlyReview] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [list, review] = await Promise.all([
      api.get<Question[]>(`/questions/unit/${unitId}${onlyReview ? '?needsReview=true' : ''}`),
      api.get<ReviewSummary>(`/questions/unit/${unitId}/review-summary`),
    ]);
    setQuestions(list);
    setSummary(review);
    setLoaded(true);
  }, [unitId, onlyReview]);

  useEffect(() => {
    void load().catch(() => setLoaded(true));
  }, [load]);

  async function save(work: () => Promise<unknown>, message: string) {
    await onRun(work, message);
    await load();
  }

  if (!loaded) {
    return (
      <div className="card">
        <h2 style={{ margin: 0 }}>Questions</h2>
        <p className="muted">Loading…</p>
      </div>
    );
  }

  return (
    <div className="card stack">
      <div className="between">
        <h2 style={{ margin: 0 }}>Questions ({summary?.total ?? questions.length})</h2>
        <label className="row" style={{ gap: '.4rem', fontSize: '.9rem' }}>
          <input
            type="checkbox"
            checked={onlyReview}
            onChange={(e) => setOnlyReview(e.target.checked)}
            aria-label="Show only questions needing review"
          />
          Only those needing a check
        </label>
      </div>

      {summary && summary.needingReview > 0 && (
        <p className="alert warn" role="status">
          {summary.needingReview} question{summary.needingReview === 1 ? '' : 's'} could not be read
          from the file and need{summary.needingReview === 1 ? 's' : ''} your answer before it can
          be published.
        </p>
      )}

      {summary && (
        <p className="muted" data-testid="question-summary">
          {summary.published} published · {summary.readyToPublish} ready · {summary.needingReview}{' '}
          needing a check
        </p>
      )}

      {questions.length === 0 ? (
        <p className="muted">
          {onlyReview ? 'Nothing here needs checking.' : 'This unit has no questions yet.'}
        </p>
      ) : (
        questions.map((question) => (
          <QuestionRow
            key={question.id}
            question={question}
            isEditing={editing === question.id}
            onToggle={() => setEditing(editing === question.id ? null : question.id)}
            onSave={save}
          />
        ))
      )}
    </div>
  );
}

function QuestionRow({
  question,
  isEditing,
  onToggle,
  onSave,
}: {
  question: Question;
  isEditing: boolean;
  onToggle: () => void;
  onSave: (work: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const choices = choicesOf(question);
  const correct = correctChoiceId(question);

  return (
    <div className="card" style={{ background: 'var(--bg)' }} data-question-id={question.id}>
      <div className="between">
        <div style={{ minWidth: 0 }}>
          <strong data-testid="question-prompt">{question.prompt}</strong>
          <div className="muted" style={{ fontSize: '.85rem', marginTop: '.2rem' }}>
            {question.type?.displayName ?? question.typeKey}
            {question.sourceRef ? ` · from the file (${question.sourceRef})` : ''}
            {` · ${question.points} mark${question.points === 1 ? '' : 's'}`}
          </div>
        </div>
        <div className="row">
          {question.needsReview && (
            <span className="badge disabled" data-testid="needs-review">
              Needs a check
            </span>
          )}
          <span className={`badge ${question.status === 'PUBLISHED' ? 'active' : 'disabled'}`}>
            {question.status === 'PUBLISHED' ? 'Published' : 'Draft'}
          </span>
          <button className="small" onClick={onToggle} aria-label={`Edit: ${question.prompt}`}>
            {isEditing ? 'Close' : 'Edit'}
          </button>
        </div>
      </div>

      {question.reviewNotes && (
        <p className="muted" style={{ marginTop: '.5rem' }} data-testid="review-note">
          {question.reviewNotes}
        </p>
      )}

      {!isEditing && choices.length > 0 && (
        <ul style={{ margin: '.6rem 0 0', paddingInlineStart: '1.2rem' }}>
          {choices.map((choice) => (
            <li key={choice.id} data-testid="choice-readonly">
              {choice.text}
              {correct === choice.id && (
                <span className="badge active" style={{ marginInlineStart: '.5rem' }}>
                  Correct
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {!isEditing && choices.length === 0 && !correct && (
        <p className="muted" style={{ marginTop: '.5rem' }}>
          Answer: <code>{JSON.stringify(question.answerKey)}</code>
        </p>
      )}

      {isEditing && <QuestionEditor question={question} onSave={onSave} onDone={onToggle} />}
    </div>
  );
}

/**
 * Editing one question.
 *
 * Choice questions get a proper form, because that is every question this
 * curriculum actually contains. Any other shape falls back to editing the
 * stored answer directly, so a kind added later is still correctable here
 * rather than being stuck until someone writes a form for it.
 */
function QuestionEditor({
  question,
  onSave,
  onDone,
}: {
  question: Question;
  onSave: (work: () => Promise<unknown>, message: string) => Promise<void>;
  onDone: () => void;
}) {
  const [prompt, setPrompt] = useState(question.prompt);
  const [choices, setChoices] = useState<Choice[]>(choicesOf(question));
  const [correct, setCorrect] = useState<string | null>(correctChoiceId(question));
  const [points, setPoints] = useState(question.points);
  const [rawKey, setRawKey] = useState(JSON.stringify(question.answerKey, null, 2));
  const [reviewed, setReviewed] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const isChoiceKind = choices.length > 0;

  function updateChoice(id: string, text: string) {
    setChoices((current) => current.map((c) => (c.id === id ? { ...c, text } : c)));
  }

  async function submit() {
    setProblem(null);

    const body: Record<string, unknown> = { prompt, points };

    if (isChoiceKind) {
      if (!correct) {
        setProblem('Choose which answer is the correct one.');
        return;
      }
      if (choices.some((c) => c.text.trim() === '')) {
        setProblem('An answer choice cannot be empty.');
        return;
      }
      body.payload = { ...question.payload, options: choices };
      body.answerKey = { correctOptionId: correct };
    } else {
      try {
        body.answerKey = JSON.parse(rawKey);
      } catch {
        setProblem('That answer is not valid. Check the punctuation.');
        return;
      }
    }

    if (reviewed) body.reviewed = true;

    await onSave(() => api.patch(`/questions/${question.id}`, body), 'Question saved.');
    onDone();
  }

  return (
    <div className="stack" style={{ marginTop: '.75rem' }}>
      {problem && (
        <p className="alert error" role="alert">
          {problem}
        </p>
      )}

      <label>
        Question
        <textarea
          rows={2}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          aria-label="Question text"
          data-testid="edit-prompt"
        />
      </label>

      {isChoiceKind ? (
        <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '.75rem' }}>
          <legend style={{ padding: '0 .4rem', fontSize: '.9rem' }}>
            Answer choices — select the correct one
          </legend>
          {choices.map((choice, index) => (
            <div key={choice.id} className="row" style={{ marginBottom: '.5rem' }}>
              <input
                type="radio"
                name={`correct-${question.id}`}
                checked={correct === choice.id}
                onChange={() => setCorrect(choice.id)}
                aria-label={`Mark choice ${index + 1} correct`}
                data-testid={`correct-${choice.id}`}
              />
              <input
                type="text"
                value={choice.text}
                onChange={(e) => updateChoice(choice.id, e.target.value)}
                aria-label={`Answer choice ${index + 1}`}
                data-testid={`choice-${choice.id}`}
                style={{ flex: 1 }}
              />
            </div>
          ))}
        </fieldset>
      ) : (
        <label>
          Answer
          <textarea
            rows={3}
            value={rawKey}
            onChange={(e) => setRawKey(e.target.value)}
            aria-label="Answer key"
            data-testid="edit-answer-key"
            style={{ fontFamily: 'monospace' }}
          />
        </label>
      )}

      <label style={{ maxWidth: '10rem' }}>
        Marks
        <input
          type="number"
          min={1}
          value={points}
          onChange={(e) => setPoints(Number(e.target.value))}
          aria-label="Marks for this question"
        />
      </label>

      {question.needsReview && (
        <label className="row" style={{ gap: '.4rem' }}>
          <input
            type="checkbox"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
            data-testid="mark-reviewed"
          />
          I have checked this question — it can be published
        </label>
      )}

      <div className="row">
        <button onClick={submit} data-testid="save-question">
          Save
        </button>
        <button  onClick={onDone}>
          Cancel
        </button>
        {question.status === 'PUBLISHED' ? (
          <button
            className="small"
            onClick={() =>
              onSave(
                () => api.post(`/questions/${question.id}/status`, { status: 'DRAFT' }),
                'Question hidden from students.',
              )
            }
          >
            Hide from students
          </button>
        ) : (
          <button
            className="small"
            data-testid="publish-question"
            onClick={() =>
              onSave(
                () => api.post(`/questions/${question.id}/status`, { status: 'PUBLISHED' }),
                'Question published.',
              )
            }
          >
            Publish to students
          </button>
        )}
      </div>
    </div>
  );
}
