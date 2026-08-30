'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, FormEvent } from 'react';
import { api, ApiError, homeFor, Me, Student } from '@/lib/api';

export default function StudentsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [showDeleted, setShowDeleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ name: string; password: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Student | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.get<Student[]>(`/students?includeDeleted=${showDeleted}`);
      setStudents(list);
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.push('/login');
        return;
      }
      setError(caught instanceof ApiError ? caught.message : 'Could not load your students.');
    } finally {
      setLoading(false);
    }
  }, [showDeleted, router]);

  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then((user) => {
        // This page is the teacher's. A student is sent to her own instead of
        // being shown a screen she has no permission to use.
        if (user.role === 'STUDENT' || user.mustChangePassword) {
          router.replace(homeFor(user));
          return;
        }
        setMe(user);
      })
      .catch(() => router.push('/login'));
  }, [router]);

  useEffect(() => {
    if (me) void load();
  }, [me, load]);

  /** Runs one action against a student, then refreshes the list. */
  async function act(student: Student, run: () => Promise<unknown>, message: string) {
    setBusyId(student.id);
    setError(null);
    setNotice(null);

    try {
      await run();
      setNotice(message);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'That did not work.');
    } finally {
      setBusyId(null);
    }
  }

  async function resetPassword(student: Student) {
    setBusyId(student.id);
    setError(null);
    setNotice(null);

    try {
      const result = await api.post<{ temporaryPassword: string }>(
        `/students/${student.id}/reset-password`,
      );
      setTempPassword({ name: student.fullName, password: result.temporaryPassword });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not reset the password.');
    } finally {
      setBusyId(null);
    }
  }

  async function signOut() {
    await api.post('/auth/logout').catch(() => undefined);
    router.push('/login');
  }

  if (!me) return <main className="page"><p className="muted">Loading…</p></main>;

  return (
    <main className="page stack">
      <div className="between">
        <div>
          <h1>My students</h1>
          {/* The teacher's name comes from her account, never a fixed value (SRS 33). */}
          <p className="muted">Signed in as {me.displayName}</p>
        </div>
        <div className="row">
          <button onClick={() => router.push('/change-password')}>Change my password</button>
          <button onClick={signOut}>Sign out</button>
        </div>
      </div>

      {error && <p className="alert error" role="alert">{error}</p>}
      {notice && <p className="alert ok" role="status">{notice}</p>}

      {tempPassword && (
        <div className="card" style={{ borderColor: 'var(--warning)' }}>
          <h2>Temporary password for {tempPassword.name}</h2>
          <p className="muted">
            Give this to her now — it is shown once and cannot be retrieved later. She will be
            asked to choose her own password when she signs in.
          </p>
          <div className="row" style={{ marginTop: '.75rem' }}>
            <code className="temp">{tempPassword.password}</code>
            <button className="small" onClick={() => setTempPassword(null)}>Done</button>
          </div>
        </div>
      )}

      <AddStudentForm
        onAdded={(name) => {
          setNotice(`${name} was added.`);
          void load();
        }}
        onError={setError}
      />

      {editing && (
        <EditStudentForm
          student={editing}
          onCancel={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            setNotice(`${name} was updated.`);
            void load();
          }}
          onError={setError}
        />
      )}

      <div className="card">
        <div className="between" style={{ marginBottom: '.75rem' }}>
          <h2 style={{ margin: 0 }}>
            {students.filter((s) => !s.isDeleted).length} student
            {students.filter((s) => !s.isDeleted).length === 1 ? '' : 's'}
          </h2>
          <label className="row" style={{ margin: 0, fontWeight: 400 }}>
            <input
              type="checkbox"
              checked={showDeleted}
              onChange={(event) => setShowDeleted(event.target.checked)}
              style={{ width: 'auto' }}
            />
            <span className="muted">Show deleted</span>
          </label>
        </div>

        {loading ? (
          <p className="muted">Loading…</p>
        ) : students.length === 0 ? (
          <p className="muted">No students yet. Add your first one above.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th className="hide-sm">Email</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id} className={student.isDeleted ? 'is-deleted' : undefined}>
                    <td>{student.fullName}</td>
                    <td data-label="Username">{student.username}</td>
                    <td className="muted" data-label="Email">{student.email ?? '—'}</td>
                    <td data-label="Status">
                      {student.isDeleted ? (
                        <span className="badge deleted">Deleted</span>
                      ) : student.status === 'DISABLED' ? (
                        <span className="badge disabled">Disabled</span>
                      ) : (
                        <span className="badge active">Active</span>
                      )}
                    </td>
                    <td>
                      <div className="row">
                        {student.isDeleted ? (
                          <button
                            className="small"
                            disabled={busyId === student.id}
                            onClick={() =>
                              act(
                                student,
                                () => api.post(`/students/${student.id}/restore`),
                                `${student.fullName} was restored.`,
                              )
                            }
                          >
                            Restore
                          </button>
                        ) : (
                          <>
                            <button
                              className="small"
                              disabled={busyId === student.id}
                              onClick={() => setEditing(student)}
                            >
                              Edit
                            </button>
                            <button
                              className="small"
                              disabled={busyId === student.id}
                              onClick={() => resetPassword(student)}
                            >
                              Reset password
                            </button>
                            <button
                              className="small"
                              disabled={busyId === student.id}
                              onClick={() =>
                                act(
                                  student,
                                  () =>
                                    api.post(
                                      `/students/${student.id}/${
                                        student.status === 'ACTIVE' ? 'disable' : 'enable'
                                      }`,
                                    ),
                                  student.status === 'ACTIVE'
                                    ? `${student.fullName} can no longer sign in.`
                                    : `${student.fullName} can sign in again.`,
                                )
                              }
                            >
                              {student.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              className="small danger"
                              disabled={busyId === student.id}
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    `Delete ${student.fullName}?\n\nShe will be hidden and cannot sign in, but all her results and messages are kept. You can restore her at any time.`,
                                  )
                                ) {
                                  return;
                                }
                                void act(
                                  student,
                                  () => api.del(`/students/${student.id}`),
                                  `${student.fullName} was deleted. You can restore her from "Show deleted".`,
                                );
                              }}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function AddStudentForm({
  onAdded,
  onError,
}: {
  onAdded: (name: string) => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);

    try {
      await api.post('/students', {
        fullName,
        username,
        password,
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      onAdded(fullName);
      setFullName('');
      setUsername('');
      setPassword('');
      setEmail('');
      setOpen(false);
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'Could not add the student.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="primary" onClick={() => setOpen(true)}>
        Add a student
      </button>
    );
  }

  return (
    <form className="card" onSubmit={handleSubmit} noValidate>
      <h2>Add a student</h2>

      <label htmlFor="fullName">Full name</label>
      <input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />

      <label htmlFor="newUsername">Username</label>
      <input
        id="newUsername"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoCapitalize="none"
        required
      />
      <p className="muted">Letters, numbers, dots, dashes and underscores.</p>

      <label htmlFor="newPassword">Temporary password</label>
      <input
        id="newPassword"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        minLength={8}
        required
      />
      <p className="muted">She will choose her own password when she first signs in.</p>

      <label htmlFor="newEmail">Email (optional)</label>
      <input id="newEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <p className="muted">
        With an email she can reset her own password. Without one, you reset it for her.
      </p>

      <div className="row" style={{ marginTop: '1.25rem' }}>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Adding…' : 'Add student'}
        </button>
        <button type="button" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EditStudentForm({
  student,
  onSaved,
  onCancel,
  onError,
}: {
  student: Student;
  onSaved: (name: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [fullName, setFullName] = useState(student.fullName);
  const [username, setUsername] = useState(student.username);
  const [email, setEmail] = useState(student.email ?? '');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);

    try {
      await api.patch(`/students/${student.id}`, { fullName, username, email: email.trim() });
      onSaved(fullName);
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'Could not save the changes.');
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit} noValidate style={{ borderColor: 'var(--primary)' }}>
      <h2>Edit {student.fullName}</h2>

      <label htmlFor="editName">Full name</label>
      <input id="editName" value={fullName} onChange={(e) => setFullName(e.target.value)} required />

      <label htmlFor="editUsername">Username</label>
      <input
        id="editUsername"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoCapitalize="none"
        required
      />

      <label htmlFor="editEmail">Email (optional)</label>
      <input id="editEmail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

      <div className="row" style={{ marginTop: '1.25rem' }}>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
