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
  timeAgo,
} from '@/lib/api';
import { Conversation } from '@/components/Conversation';
import { AttemptReview } from '@/components/AttemptReview';

/**
 * One student, unit by unit.
 *
 * The word list is shown step by step — read, heard, checked — because that is
 * where a teacher can see what a student is actually stuck on, rather than
 * only that she has not finished.
 */
export default function StudentProgressPage() {
  const router = useRouter();
  const params = useParams<{ studentId: string }>();
  const studentId = params.studentId;

  const [me, setMe] = useState<Me | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [paper, setPaper] = useState<TeacherAttemptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await api.get<StudentDetail>(`/progress/students/${studentId}`));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not load this student.');
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
    if (me) void load();
  }, [me, load]);

  /** Opens one finished paper, exactly as the student was given it. */
  async function openPaper(attemptId: string) {
    try {
      setPaper(await api.get<TeacherAttemptDetail>(`/progress/attempts/${attemptId}`));
      setError(null);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not open that paper.');
    }
  }

  if (!me || (!detail && !error)) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (!detail) {
    return (
      <main className="page stack">
        <p className="alert error" role="alert">
          {error}
        </p>
        <button onClick={() => router.push('/progress')}>Back to class progress</button>
      </main>
    );
  }

  return (
    <main className="page stack">
      <div className="between">
        <div>
          <h1>{detail.fullName}</h1>
          <p className="muted">
            {detail.username} · last active {timeAgo(detail.lastActivityAt)} · last signed in{' '}
            {timeAgo(detail.lastLoginAt)}
          </p>
        </div>
        <button onClick={() => router.push('/progress')}>Back to class progress</button>
      </div>

      {detail.units.map((unit) => (
        <div key={unit.unitId} className="card stack" data-testid="student-unit">
          <div className="between">
            <h2 style={{ margin: 0 }}>{unit.title}</h2>
            <span className="badge active" data-testid="unit-overall">
              {unit.progress.overallPercent}%
            </span>
          </div>

          <div className="meter">
            <span style={{ width: `${unit.progress.overallPercent}%` }} />
          </div>

          <dl className="parts">
            <div>
              <dt>Words</dt>
              <dd>
                {unit.progress.vocabulary.done}/{unit.progress.vocabulary.total}
              </dd>
            </div>
            <div>
              <dt>Grammar</dt>
              <dd>
                {unit.progress.grammar.total === 0
                  ? '—'
                  : `${unit.progress.grammar.done}/${unit.progress.grammar.total}`}
              </dd>
            </div>
            <div>
              <dt>Assessment</dt>
              <dd data-testid="assessment-state">
                {unit.progress.assessmentState.questionCount === 0
                  ? 'none set'
                  : unit.progress.assessmentState.passed
                    ? `passed (${unit.progress.assessmentState.bestScorePercent}%)`
                    : `${unit.progress.assessmentState.attemptsUsed} of ${
                        unit.progress.assessmentState.maxAttempts ?? '∞'
                      } tries`}
              </dd>
            </div>
            <div>
              <dt>Best score</dt>
              <dd data-testid="best-score">
                {unit.progress.bestScorePercent === null
                  ? 'not tried'
                  : `${unit.progress.bestScorePercent}%`}
              </dd>
            </div>
            <div>
              <dt>Tries</dt>
              <dd data-testid="attempt-count">{unit.progress.attemptsTaken}</dd>
            </div>
          </dl>

          {unit.words.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Word</th>
                    <th>Read</th>
                    <th>Heard</th>
                    <th>Checked</th>
                    <th>Tries</th>
                  </tr>
                </thead>
                <tbody>
                  {unit.words.map((word) => (
                    <tr key={word.id} data-testid="word-row">
                      <td data-label="Word">
                        {word.wordEn}
                        {word.learned && (
                          <span className="badge active" style={{ marginInlineStart: '.4rem' }}>
                            Learned
                          </span>
                        )}
                      </td>
                      <td data-label="Read">{word.seen ? '✓' : '—'}</td>
                      <td data-label="Heard">{word.audioPlayed ? '✓' : '—'}</td>
                      <td data-label="Checked">{word.checked ? '✓' : '—'}</td>
                      <td data-label="Tries">{word.checkAttempts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {unit.attempts.length > 0 && (
            <div>
              <strong style={{ fontSize: 'var(--fs-body)' }}>Papers she has finished</strong>
              <ul className="examples" data-testid="attempt-list">
                {unit.attempts.map((attempt) => (
                  <li key={attempt.id} className="between" style={{ gap: '.5rem' }}>
                    <span>
                      {attempt.purpose === 'ASSESSMENT' ? 'Assessment' : 'Activity'} ·{' '}
                      {attempt.scorePercent}% — {attempt.correctCount} right,{' '}
                      {attempt.incorrectCount} wrong
                      {attempt.submittedAt &&
                        ` · ${new Date(attempt.submittedAt).toLocaleDateString('en-GB')}`}
                    </span>
                    {/*
                      The score alone does not tell her what to teach next.
                      This opens the paper as the student sat it: which
                      questions she got wrong, and what she answered.
                    */}
                    <button
                      className="small"
                      onClick={() => void openPaper(attempt.id)}
                      data-testid="open-attempt"
                    >
                      See her answers
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}

      {paper && <AttemptReview attempt={paper} onClose={() => setPaper(null)} />}

      <Conversation
        loadPath={`/messages/students/${studentId}`}
        sendPath={`/messages/students/${studentId}`}
        readPath={`/messages/students/${studentId}/read`}
        placeholder="Write feedback for this student…"
        emptyText="No messages yet. Write the first one below."
      />
    </main>
  );
}
