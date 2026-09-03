'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiError,
  CreatedSchool,
  homeFor,
  Me,
  PlatformOverview,
  SchoolNeed,
  SchoolOverview,
} from '@/lib/api';
import { AdminHeader } from '@/components/AdminShell';

/**
 * The schools, and how a new one begins.
 *
 * Opening a school used to mean writing SQL. It now means filling in four
 * fields: the school's name and the name, username and email of the one person
 * who will run it. Both are made together — a school with nobody able to sign
 * in would be worse than a failure the operator can see and retry — and the
 * way in is shown exactly once, on this screen, straight after.
 *
 * Everything listed here is a count. There is no student, no teacher by name,
 * no address: those belong to the school, and this screen has no business
 * holding them.
 */
export default function SchoolsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [schools, setSchools] = useState<SchoolOverview[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<CreatedSchool | null>(null);

  const load = useCallback(async () => {
    try {
      const platform = await api.get<PlatformOverview>('/admin/overview');
      setSchools(platform.schools);
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.push('/login');
        return;
      }
      setError(
        caught instanceof ApiError && caught.status === 403
          ? 'This is not available to your account.'
          : 'The schools could not be loaded. Check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then((user) => {
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

  const open = schools?.filter((school) => school.status === 'ACTIVE').length ?? 0;
  const closed = (schools?.length ?? 0) - open;

  return (
    <>
      <AdminHeader me={me} current="/admin/schools" />
      <main className="page stack">
        <div className="pagehead">
          <h1>Schools</h1>
          <p className="muted">
            {schools
              ? schools.length === 0
                ? 'None yet'
                : `${open} open` + (closed > 0 ? ` · ${closed} closed` : '')
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
        {notice && (
          <p className="alert ok" role="status">
            {notice}
          </p>
        )}

        {created && (
          <FirstAdminCredential created={created} onDone={() => setCreated(null)} />
        )}

        {!created && (
          <div className="row">
            <button className="primary" onClick={() => setAdding((was) => !was)}>
              {adding ? 'Close' : 'Add a school'}
            </button>
          </div>
        )}

        {adding && !created && (
          <AddSchoolForm
            onCreated={(result) => {
              setAdding(false);
              setNotice(null);
              setCreated(result);
              void load();
            }}
            onError={setError}
          />
        )}

        {loading ? (
          <p className="muted">Loading…</p>
        ) : !schools ? null : schools.length === 0 ? (
          <section className="panel">
            <div className="panel-body">
              <p className="note-line">
                No school has been set up yet. Add the first one and you will be given a
                username and a one-time password to pass to whoever will run it.
              </p>
            </div>
          </section>
        ) : (
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">All schools</h2>
              <span className="panel-note">Counts only — no personal data</span>
            </div>
            <ul className="estate">
              {schools.map((school) => (
                <SchoolRow key={school.id} school={school} />
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}

/**
 * The way into a brand-new school.
 *
 * Shown once and never again: only a hash of this password is kept, so no
 * later request can return it. That is worth saying on the screen rather than
 * leaving the operator to find out when she comes back for it.
 */
function FirstAdminCredential({
  created,
  onDone,
}: {
  created: CreatedSchool;
  onDone: () => void;
}) {
  const { school, firstAdmin } = created;

  return (
    <section className="panel" data-testid="first-admin">
      <div className="panel-head">
        <h2 className="panel-title">{school.name} is open</h2>
        <span className="panel-note">Shown once</span>
      </div>
      <div className="panel-body stack">
        <p className="note-line">
          Give these to {firstAdmin.displayName} now. The password is not stored anywhere it
          can be read again — if it is lost, she resets it by email. She will be asked to
          choose her own the first time she signs in.
        </p>
        <dl className="handover">
          <div>
            <dt>Username</dt>
            <dd>
              <code className="temp">{firstAdmin.username}</code>
            </dd>
          </div>
          <div>
            <dt>One-time password</dt>
            <dd>
              <code className="temp">{firstAdmin.temporaryPassword}</code>
            </dd>
          </div>
          <div>
            <dt>Email for resets</dt>
            <dd>{firstAdmin.email}</dd>
          </div>
        </dl>
        <div className="row">
          <button className="primary small" onClick={onDone}>
            I have passed these on
          </button>
        </div>
      </div>
    </section>
  );
}

function AddSchoolForm({
  onCreated,
  onError,
}: {
  onCreated: (created: CreatedSchool) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [adminDisplayName, setAdminDisplayName] = useState('');
  const [adminUsername, setAdminUsername] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);

    try {
      onCreated(
        await api.post<CreatedSchool>('/admin/schools', {
          name: name.trim(),
          adminDisplayName: adminDisplayName.trim(),
          adminUsername: adminUsername.trim(),
          adminEmail: adminEmail.trim(),
        }),
      );
      setName('');
      setAdminDisplayName('');
      setAdminUsername('');
      setAdminEmail('');
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The school could not be created.';
      // A name or username already in use belongs beside the field she can
      // change, not at the top of the page.
      if (caught instanceof ApiError && (caught.status === 409 || caught.status === 400)) {
        setProblem(message);
      } else {
        onError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  const ready =
    name.trim().length >= 2 &&
    adminDisplayName.trim().length > 0 &&
    adminUsername.trim().length >= 3 &&
    adminEmail.trim().length > 0;

  return (
    <form className="panel" onSubmit={handleSubmit} noValidate>
      <div className="panel-head">
        <h2 className="panel-title">Add a school</h2>
      </div>
      <div className="panel-body stack">
        <div>
          <label htmlFor="schoolName">School name</label>
          <input
            id="schoolName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={problem ? true : undefined}
            required
          />
        </div>

        <p className="note-line">
          Every school needs one administrator to begin with — she adds the teachers, and
          they add their students. Her account is created together with the school.
        </p>

        <div className="pair">
          <div>
            <label htmlFor="adminDisplayName">Administrator&rsquo;s name</label>
            <input
              id="adminDisplayName"
              value={adminDisplayName}
              onChange={(event) => setAdminDisplayName(event.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="adminUsername">Her username</label>
            <input
              id="adminUsername"
              value={adminUsername}
              onChange={(event) => setAdminUsername(event.target.value)}
              autoCapitalize="none"
              aria-describedby="adminUsernameHelp"
              aria-invalid={problem ? true : undefined}
              required
            />
            <p className="muted" id="adminUsernameHelp">
              Letters, numbers, dots, dashes and underscores. This is what she types to sign
              in.
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="adminEmail">Her email</label>
          <input
            id="adminEmail"
            type="email"
            value={adminEmail}
            onChange={(event) => setAdminEmail(event.target.value)}
            aria-describedby="adminEmailHelp"
            required
          />
          <p className="muted" id="adminEmailHelp">
            Required. She is the most senior person in her school, so resetting her own
            password by email is her only way back in.
          </p>
        </div>

        {problem && (
          <p className="alert error" role="alert">
            {problem}
          </p>
        )}

        <p className="note-line">
          Her first password is generated when you submit this, and shown to you once.
        </p>

        <div className="row">
          <button className="primary" type="submit" disabled={busy || !ready}>
            {busy ? 'Creating…' : 'Create school'}
          </button>
        </div>
      </div>
    </form>
  );
}

const NEEDS: Record<SchoolNeed, string> = {
  marked_disabled: 'Closed',
  no_teacher: 'No teacher',
  no_students: 'No students',
  no_course: 'No course',
};

/** The two gaps that stop a school from working at all. */
const BLOCKING: SchoolNeed[] = ['no_teacher', 'no_course'];

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
