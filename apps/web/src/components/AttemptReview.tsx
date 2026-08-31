'use client';

import { TeacherAttemptDetail } from '@/lib/api';
import { QuestionBody, QuestionPictures } from './QuestionViews';

/**
 * One finished paper, as the teacher reads it.
 *
 * "6 out of 10" tells her nothing she can act on. This shows which six, what
 * the student wrote for the four she got wrong, and what the right answer was,
 * so a lesson can be aimed at the actual gap.
 *
 * Everything comes from the attempt's frozen snapshots and is rendered by the
 * same components the student answered on, so the paper reads as she sat it —
 * even for questions corrected since.
 */
export function AttemptReview({
  attempt,
  onClose,
}: {
  attempt: TeacherAttemptDetail;
  onClose: () => void;
}) {
  const wrong = attempt.questions.filter((q) => q.isCorrect === false);

  return (
    <div className="card stack" data-testid="attempt-review">
      <div className="between">
        <div>
          <h2 style={{ margin: 0 }}>
            {attempt.purpose === 'ASSESSMENT' ? 'Assessment' : 'Activity'} · {attempt.unit.title}
          </h2>
          <p className="muted" style={{ margin: '.2rem 0 0' }}>
            {attempt.student.fullName}
            {attempt.submittedAt &&
              ` · ${new Date(attempt.submittedAt).toLocaleDateString('en-GB')}`}
            {' · '}
            {attempt.correctCount} right, {attempt.incorrectCount} wrong
            {typeof attempt.passMarkPercent === 'number' &&
              ` · pass mark on the day ${attempt.passMarkPercent}%`}
          </p>
        </div>
        <div className="row">
          {typeof attempt.passed === 'boolean' && (
            <span className={`badge ${attempt.passed ? 'active' : 'deleted'}`}>
              {attempt.passed ? 'Passed' : 'Not passed'}
            </span>
          )}
          <span className="badge active" data-testid="attempt-score">
            {attempt.scorePercent}%
          </span>
          <button className="small" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <p className="muted" style={{ margin: 0 }}>
        {wrong.length === 0
          ? 'She answered every question correctly.'
          : `She got ${wrong.length} question${wrong.length === 1 ? '' : 's'} wrong.`}{' '}
        This is the paper as she was given it, not the unit as it stands now.
      </p>

      {attempt.questions.map((question, index) => (
        <div
          key={question.answerId}
          className="card"
          style={{ background: 'var(--bg)' }}
          data-testid="reviewed-question"
          data-correct={question.isCorrect}
        >
          <div className="between">
            <span className="muted" style={{ fontSize: '.8rem' }}>
              Question {index + 1} of {attempt.questions.length}
            </span>
            <span className={`badge ${question.isCorrect ? 'active' : 'deleted'}`}>
              {question.isCorrect ? 'Right' : 'Wrong'}
            </span>
          </div>

          <strong style={{ display: 'block', marginTop: '.4rem' }}>{question.prompt}</strong>

          <div style={{ marginTop: '.5rem' }}>
            <QuestionPictures question={question} />
          </div>

          <div style={{ marginTop: '.5rem' }}>
            {/*
              The student's own view, marked and locked. `finished` makes every
              control read-only, so a teacher looking at a paper cannot change
              what it says — and never sends anything.
            */}
            <QuestionBody
              question={question}
              finished
              response={question.response}
              onAnswer={() => undefined}
            />
          </div>

          {question.response === null && (
            <p className="muted" style={{ margin: '.5rem 0 0' }} data-testid="no-answer">
              She left this one blank.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
