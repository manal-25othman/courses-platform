'use client';

import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, ApiError, homeFor, Me, SchoolDetail, SchoolNeed } from '@/lib/api';
import { AdminHeader } from '@/components/AdminShell';
import { Icon } from '@/components/Icon';

/**
 * One school, opened.
 *
 * Two things can be changed from here: what the school is called, and whether
 * the people in it can sign in. Everything else on the page is a count, and
 * belongs to the school rather than to the platform — which is why there is no
 * roster here, and no way to reach into one from this screen.
 *
 * Closing a school is written out in full before it happens, because it does
 * something real: it turns everybody in the school away at the door and ends
 * the sessions they already have.
 */
export default function SchoolPage() {
  const router = useRouter();
  const params = useParams<{ schoolId: string }>();
  const schoolId = params.schoolId;

  const [me, setMe] = useState<Me | null>(null);
  const [school, setSchool] = useState<SchoolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSchool(await api.get<SchoolDetail>(`/admin/schools/${schoolId}`));
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.push('/login');
        return;
      }
      // A school that is not there and a school that is not yours look the
      // same from here, and that is deliberate on the API's side.
      if (caught instanceof ApiError && (caught.status === 404 || caught.status === 400)) {
        setMissing(true);
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
  }, [router, schoolId]);

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

  async function setStatus(next: 'ACTIVE' | 'DISABLED') {
    setBusy(true);
    setError(null);

    try {
      const updated = await api.post<SchoolDetail>(
        `/admin/schools/${schoolId}/${next === 'ACTIVE' ? 'enable' : 'disable'}`,
      );
      setSchool(updated);
      setConfirming(false);
      // No success banner: the page itself is the answer. The heading, the
      // standing notice and the button that now offers the opposite all say
      // what happened, and a third sentence saying it again is noise.
      setNotice(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'The change could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!me) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (missing) {
    return (
      <>
        <AdminHeader me={me} current="/admin/schools" />
        <main className="page stack">
          <div className="pagehead">
            <h1>School not found</h1>
            <p className="muted">It may have been removed, or the address may be wrong.</p>
          </div>
          <div className="row">
            <button className="crumb" onClick={() => router.push('/admin/schools')}>
              <Icon name="back" size={15} />
              Schools
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <AdminHeader me={me} current="/admin/schools" />
      <main className="page stack">
        <button
          className="crumb"
          onClick={() => router.push('/admin/schools')}
          data-testid="back"
        >
          <Icon name="back" size={15} />
          Schools
        </button>

        <div className="pagehead">
          <h1>{school ? school.name : 'Loading…'}</h1>
          <p className="muted">
            {school
              ? school.signInAllowed
                ? `Open · added ${added(school)}`
                : `Closed · added ${added(school)}`
              : ''}
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

        {loading ? (
          <p className="muted">Loading…</p>
        ) : !school ? null : (
          <>
            {!school.signInAllowed && (
              <p className="alert warn">
                This school is closed. Nobody in it can sign in and no session in it can be
                renewed. You can still manage it from here.
              </p>
            )}

            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">What it holds</h2>
                <span className="panel-note">Counts only — no personal data</span>
              </div>
              <div className="panel-body stack">
                <dl className="tally">
                  <Tally label="Teachers" value={school.teachers} />
                  <Tally label="Students" value={school.students} />
                  <Tally label="Administrators" value={school.schoolAdmins} />
                  <Tally label="Courses" value={school.courses} />
                </dl>

                <Gaps school={school} />
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">Managing this school</h2>
              </div>

              <div className="schoolact">
                {renaming ? (
                  <RenameForm
                    school={school}
                    onSaved={(updated) => {
                      setSchool(updated);
                      setRenaming(false);
                      setNotice(`The school is now called ${updated.name}.`);
                    }}
                    onCancel={() => setRenaming(false)}
                    onError={setError}
                  />
                ) : (
                  <div className="schoolact-row">
                    <p>Teachers and students see this name when they sign in.</p>
                    <button className="small" onClick={() => setRenaming(true)}>
                      Change the name
                    </button>
                  </div>
                )}
              </div>

              <div className="schoolact">
                {confirming ? (
                  <div className="confirm" role="group" aria-label="Confirm the change">
                    <p className="confirm-title">
                      {school.signInAllowed
                        ? `Close ${school.name}?`
                        : `Open ${school.name} again?`}
                    </p>
                    <p className="confirm-body">
                      {school.signInAllowed ? (
                        <>
                          Everybody in it — administrators, teachers and students — will be
                          turned away at sign-in, and the sessions they are in now will end.
                          Somebody already working in the app may keep the page she has open
                          for up to fifteen minutes before it stops. Nothing is deleted, and
                          you can open the school again at any time.
                        </>
                      ) : (
                        <>
                          Everybody in it will be able to sign in again. They will each need to
                          sign in fresh; the sessions ended when the school was closed.
                        </>
                      )}
                    </p>
                    <div className="row">
                      <button
                        className={school.signInAllowed ? 'small danger' : 'small primary'}
                        disabled={busy}
                        onClick={() =>
                          void setStatus(school.signInAllowed ? 'DISABLED' : 'ACTIVE')
                        }
                      >
                        {busy
                          ? 'Working…'
                          : school.signInAllowed
                            ? 'Close the school'
                            : 'Open the school'}
                      </button>
                      <button
                        className="small"
                        disabled={busy}
                        onClick={() => setConfirming(false)}
                      >
                        Leave it as it is
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="schoolact-row">
                    <p>
                      {school.signInAllowed
                        ? 'Closing a school stops everyone in it signing in. Nothing is deleted.'
                        : 'Opening it lets everyone in it sign in again.'}
                    </p>
                    <button
                      className={school.signInAllowed ? 'small danger' : 'small primary'}
                      onClick={() => setConfirming(true)}
                    >
                      {school.signInAllowed ? 'Close the school' : 'Open the school'}
                    </button>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function added(school: SchoolDetail): string {
  return new Date(school.createdAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * What the school is still missing.
 *
 * Left beside the counts it is read off, and introduced, because a lone chip
 * in the corner of a panel is a puzzle rather than a fact. "Closed" is left
 * out: the banner above already says so, at the length it deserves.
 */
function Gaps({ school }: { school: SchoolDetail }) {
  const gaps = school.needs.filter((need) => need !== 'marked_disabled');
  if (gaps.length === 0) return null;

  return (
    <p className="gapline">
      <span className="gapline-label">Still needs</span>
      {gaps.map((need) => (
        <span
          key={need}
          className="part"
          data-state={BLOCKING.includes(need) ? 'gap' : 'ready'}
        >
          {NEEDS[need]}
        </span>
      ))}
    </p>
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

const NEEDS: Record<SchoolNeed, string> = {
  marked_disabled: 'Closed',
  no_teacher: 'No teacher',
  no_students: 'No students',
  no_course: 'No course',
};

const BLOCKING: SchoolNeed[] = ['no_teacher', 'no_course'];

function RenameForm({
  school,
  onSaved,
  onCancel,
  onError,
}: {
  school: SchoolDetail;
  onSaved: (school: SchoolDetail) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(school.name);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);

    try {
      onSaved(await api.patch<SchoolDetail>(`/admin/schools/${school.id}`, { name: name.trim() }));
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The name could not be saved.';
      if (caught instanceof ApiError && (caught.status === 409 || caught.status === 400)) {
        setProblem(message);
      } else {
        onError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={handleSubmit} noValidate>
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

      {problem && (
        <p className="alert error" role="alert">
          {problem}
        </p>
      )}

      <div className="row">
        <button
          className="primary small"
          type="submit"
          disabled={busy || name.trim().length < 2 || name.trim() === school.name}
        >
          {busy ? 'Saving…' : 'Save the name'}
        </button>
        <button className="small" type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
