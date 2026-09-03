'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, homeFor, Me, SchoolSummary } from '@/lib/api';
import { SchoolHeader } from '@/components/SchoolShell';

/**
 * The school office.
 *
 * What an administrator opens this for is not a number — it is the answer to
 * "is anything wrong this morning?". So the two things she can actually fix
 * lead: a child nobody is responsible for, and a teacher nobody has given a
 * class to. Both are one click from being fixed, and when there are none the
 * screen says so plainly rather than inventing something to worry about.
 *
 * The counts sit underneath as supporting fact. There is no progress figure
 * here and no child named: how the teaching is going belongs to the teachers,
 * and the administrator has her own screens for it when she wants them.
 */
export default function SchoolPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [school, setSchool] = useState<SchoolSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setSchool(await api.get<SchoolSummary>('/school/overview'));
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.push('/login');
        return;
      }
      setError(
        caught instanceof ApiError && caught.status === 403
          ? 'This is not available to your account.'
          : 'The school could not be loaded. Check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then((user) => {
        if (user.role !== 'ADMIN') {
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

  if (!me) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const settled =
    school !== null &&
    school.studentsUnassigned === 0 &&
    school.teachersWithoutStudents === 0 &&
    school.teachers > 0;

  return (
    <>
      <SchoolHeader me={me} schoolName={school?.schoolName} />
      <main className="page stack">
        <div className="pagehead">
          <h1>Your school</h1>
          <p className="muted">
            {school
              ? `${school.teachers} ${school.teachers === 1 ? 'teacher' : 'teachers'} · ` +
                `${school.students} ${school.students === 1 ? 'student' : 'students'}`
              : 'Loading…'}
          </p>
        </div>

        {error && (
          <p className="alert error" role="alert">
            {error}{' '}
            <button className="small" onClick={() => void load()}>
              Try again
            </button>
          </p>
        )}

        {loading ? (
          <p className="muted">Loading…</p>
        ) : !school ? null : school.teachers === 0 ? (
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Nobody teaches here yet</h2>
            </div>
            <div className="panel-body stack">
              <p className="note-line">
                Add your first teacher and you will be given a username and a one-time password
                to pass to her. She adds her own students, and chooses her own password when she
                first signs in.
              </p>
              <div className="row">
                <button className="primary" onClick={() => router.push('/school/teachers')}>
                  Add a teacher
                </button>
              </div>
            </div>
          </section>
        ) : (
          <>
            {settled ? (
              <p className="alert ok" role="status">
                Every student has a teacher, and every teacher has students.
              </p>
            ) : (
              <section className="panel">
                <div className="panel-head">
                  <h2 className="panel-title">Worth sorting out</h2>
                </div>
                <ul className="todo-list">
                  {school.studentsUnassigned > 0 && (
                    <li>
                      <span>
                        <b>
                          {school.studentsUnassigned}{' '}
                          {school.studentsUnassigned === 1 ? 'student has' : 'students have'} no
                          teacher.
                        </b>{' '}
                        Nobody sees them on a roster until somebody is given them.
                      </span>
                      <button className="small" onClick={() => router.push('/school/teachers')}>
                        Give them a teacher
                      </button>
                    </li>
                  )}
                  {school.teachersWithoutStudents > 0 && (
                    <li>
                      <span>
                        <b>
                          {school.teachersWithoutStudents}{' '}
                          {school.teachersWithoutStudents === 1 ? 'teacher has' : 'teachers have'}{' '}
                          no students.
                        </b>{' '}
                        Ordinary for somebody who started this week.
                      </span>
                      <button className="small" onClick={() => router.push('/school/teachers')}>
                        Open Teachers
                      </button>
                    </li>
                  )}
                </ul>
              </section>
            )}

            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">The school</h2>
              </div>
              <div className="panel-body">
                <dl className="tally">
                  <Tally label="Teachers" value={school.teachers} />
                  <Tally
                    label="Have signed in"
                    value={school.teachersSignedIn}
                    of={school.teachers}
                  />
                  <Tally label="Students" value={school.students} />
                </dl>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Tally({ label, value, of }: { label: string; value: number; of?: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {value}
        {of !== undefined && <small> of {of}</small>}
      </dd>
    </div>
  );
}
