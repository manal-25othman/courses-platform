'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  homeFor,
  Me,
  PlatformOverview,
  SchoolNeed,
  SchoolOverview,
} from '@/lib/api';
import { AdminHeader } from '@/components/AdminShell';

/**
 * The platform, for whoever runs it.
 *
 * The hero is the estate itself — one row per school, with what each holds and
 * what each is missing. The totals sit beside it rather than above it, because
 * "two schools" is a fact an operator reads once and a list of which two is
 * what she comes back for.
 *
 * Every figure comes from two database functions that return counts and
 * school-level facts and nothing else. There is no student here, no teacher by
 * name, no address, no progress — those belong to the people who teach, and
 * this screen has no business holding them.
 *
 * Nothing on this screen changes anything. Opening a school, closing one and
 * changing its name are all done under Schools, which each row links to.
 */
export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [platform, setPlatform] = useState<PlatformOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPlatform(await api.get<PlatformOverview>('/admin/overview'));
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.push('/login');
        return;
      }
      setError(
        caught instanceof ApiError && caught.status === 403
          ? 'This is not available to your account.'
          : 'The platform overview could not be loaded. Check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then((user) => {
        // Only the platform operator belongs here. Everybody else is sent to
        // their own home rather than shown a screen they cannot use — the API
        // would refuse them anyway, and this saves them the error.
        if (user.role !== 'PLATFORM_ADMIN') {
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

  const totals = platform?.totals;
  const schools = platform?.schools ?? [];
  const stuck = schools.filter((school) =>
    school.needs.some((need) => BLOCKING.includes(need)),
  ).length;

  return (
    <>
      <AdminHeader me={me} />
      <main className="page stack">
        <div className="pagehead">
          <h1>Platform</h1>
          <p className="muted">
            {totals
              ? totals.schools === 0
                ? 'Nothing set up yet'
                : `${totals.schools} ${totals.schools === 1 ? 'school' : 'schools'}` +
                  (stuck > 0 ? ` · ${stuck} not ready to teach` : ' · all ready to teach')
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
        ) : !totals ? null : totals.schools === 0 ? (
          <section className="panel">
            <div className="panel-body">
              <p className="note-line">
                No school has been set up yet. Once one exists it appears here with what it
                holds — teachers, students and courses — and anything it is still missing.
              </p>
            </div>
          </section>
        ) : (
          <>
            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Schools</h2>
                <span className="panel-note">Counts only — no personal data</span>
              </div>
              <ul className="estate">
                {schools.map((school) => (
                  <SchoolRow key={school.id} school={school} />
                ))}
              </ul>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Across the platform</h2>
              </div>
              <div className="panel-body">
                <dl className="tally">
                  <Tally label="Schools" value={totals.schools} />
                  <Tally label="Teachers" value={totals.teachers} />
                  <Tally label="Students" value={totals.students} />
                  <Tally label="School administrators" value={totals.schoolAdmins} />
                </dl>
              </div>
            </section>

            {totals.schoolsDisabled > 0 && (
              // Said plainly, because "closed" now does something: nobody in
              // such a school can sign in. Worth stating rather than leaving
              // to be read off a badge.
              <p className="alert warn">
                {totals.schoolsDisabled}{' '}
                {totals.schoolsDisabled === 1 ? 'school is' : 'schools are'} closed.{' '}
                <strong>Nobody in a closed school can sign in.</strong>{' '}
                <a href="/admin/schools">Manage schools</a>
              </p>
            )}
          </>
        )}
      </main>
    </>
  );
}

function Tally({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** What each operational state means, in the operator's words. */
const NEEDS: Record<SchoolNeed, string> = {
  marked_disabled: 'Closed',
  no_teacher: 'No teacher',
  no_students: 'No students',
  no_course: 'No course',
};

/**
 * The two gaps that stop a school working at all.
 *
 * A school with nobody to teach and nothing to teach cannot begin, and those
 * carry the warm colour. Having no students yet is ordinary for a school that
 * was added this week, and being marked disabled is a state somebody chose —
 * neither is a fault, so neither shouts. Four amber chips a row would leave
 * the school that genuinely cannot start looking like the one that is simply
 * new.
 */
const BLOCKING: SchoolNeed[] = ['no_teacher', 'no_course'];

/**
 * One school.
 *
 * The counts are the point; the name and the date are how she recognises it.
 * What it is missing is written out rather than scored, because "no teacher"
 * is a fact she can act on and "health: 68%" is not.
 */
function SchoolRow({ school }: { school: SchoolOverview }) {
  const joined = new Date(school.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <li>
      <a className="estate-row" href={`/admin/schools/${school.id}`}>
        <span className="estate-who">
          <b>{school.name}</b>
          <span>Added {joined}</span>
        </span>

        <span className="estate-counts">
          <span>
            <b>{school.teachers}</b> {school.teachers === 1 ? 'teacher' : 'teachers'}
          </span>
          <span>
            <b>{school.students}</b> {school.students === 1 ? 'student' : 'students'}
          </span>
          <span>
            <b>{school.courses}</b> {school.courses === 1 ? 'course' : 'courses'}
          </span>
        </span>

        <span className="estate-needs">
          {school.needs.length === 0 ? (
            <span className="part" data-state="ready">
              Ready
            </span>
          ) : (
            school.needs.map((need) => (
              <span
                key={need}
                className="part"
                data-state={BLOCKING.includes(need) ? 'gap' : 'ready'}
              >
                {NEEDS[need]}
              </span>
            ))
          )}
        </span>
      </a>
    </li>
  );
}
