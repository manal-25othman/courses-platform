'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, ClassOverview, homeFor, Me, timeAgo } from '@/lib/api';

/**
 * How the class is getting on.
 *
 * Every figure is read from what students have recorded. There is nothing here
 * a student sets herself, and nothing here that can be edited: it is a view of
 * her work, not a second copy of it.
 */
export default function ClassProgressPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [overview, setOverview] = useState<ClassOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    api
      .get<ClassOverview>('/progress/class')
      .then(setOverview)
      .catch((caught) => {
        setOverview({ units: [], students: [] });
        setError(caught instanceof ApiError ? caught.message : 'Could not load progress.');
      });
  }, [me]);

  if (!me || !overview) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="page stack">
      <div className="between">
        <div>
          <h1>Class progress</h1>
          <p className="muted">
            {overview.students.length} student{overview.students.length === 1 ? '' : 's'} ·{' '}
            {overview.units.length} published unit{overview.units.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="row">
          <button onClick={() => router.push('/students')}>My students</button>
          <button onClick={() => router.push('/content')}>Curriculum</button>
        </div>
      </div>

      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}

      {overview.students.length === 0 ? (
        <div className="card">
          <p className="muted">You have no students yet.</p>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table data-testid="class-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Overall</th>
                  {overview.units.map((unit) => (
                    <th key={unit.id} className="hide-sm">
                      {unit.title}
                    </th>
                  ))}
                  <th>Last active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {overview.students.map((student) => (
                  <tr key={student.studentId} data-testid="class-row">
                    <td data-label="Student">
                      <strong>{student.fullName}</strong>
                      {student.unreadFromStudent > 0 && (
                        <span className="badge deleted" style={{ marginInlineStart: '.4rem' }}>
                          {student.unreadFromStudent} new
                        </span>
                      )}
                      <div className="muted">{student.username}</div>
                    </td>
                    <td data-label="Overall">
                      <div className="meter" style={{ minWidth: '5rem' }}>
                        <span style={{ width: `${student.overallPercent}%` }} />
                      </div>
                      <span className="muted">{student.overallPercent}%</span>
                    </td>
                    {student.units.map((unit) => (
                      <td key={unit.unitId} className="hide-sm" data-label={unit.title}>
                        <span title={`Words ${unit.vocabulary.done}/${unit.vocabulary.total}`}>
                          {unit.overallPercent}%
                        </span>
                        <div className="muted" style={{ fontSize: '.75rem' }}>
                          W {unit.vocabulary.done}/{unit.vocabulary.total} · G{' '}
                          {unit.grammar.total === 0
                            ? '—'
                            : `${unit.grammar.done}/${unit.grammar.total}`}{' '}
                          · A{' '}
                          {unit.bestScorePercent === null ? '—' : `${unit.bestScorePercent}%`}
                        </div>
                      </td>
                    ))}
                    <td data-label="Last active" className="muted">
                      {timeAgo(student.lastActivityAt)}
                    </td>
                    <td>
                      <button
                        className="small"
                        data-testid={`open-${student.username}`}
                        onClick={() => router.push(`/progress/${student.studentId}`)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
