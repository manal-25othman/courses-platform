'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, FormEvent } from 'react';
import { api, ApiError, AssignableStudent, homeFor, Me, Student, Teacher } from '@/lib/api';
import { TeacherHeader } from '@/components/TeacherShell';
import { Icon } from '@/components/Icon';

/** How long a signed-in student keeps working after her account is turned off. */
const SESSION_GRACE = 'up to 15 minutes';

type Sift = 'all' | 'signin' | 'disabled' | 'removed' | 'noemail' | 'temporary';
type Order = 'name' | 'seen' | 'state';

/**
 * The teacher's student accounts.
 *
 * Accounts, not learning: what a student has done is the Class progress and
 * Student detail screens' subject, and this one links to them rather than
 * repeating them. What it answers instead is who can sign in, who is waiting
 * on a password, and what to do about it.
 *
 * Every account action here is reversible. Nothing on this screen erases a
 * student, her answers or her messages, and the wording says so rather than
 * borrowing the word "delete" for something that keeps everything.
 */
export default function StudentsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [students, setStudents] = useState<Student[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [temporary, setTemporary] = useState<{ name: string; password: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /**
   * Who teaches whom, and who there is to choose from.
   *
   * Loaded only for a school administrator: a teacher is adding students to
   * her own list and has nobody to choose between, so she is asked nothing
   * and these stay empty.
   */
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [assigned, setAssigned] = useState<Map<string, string | null>>(new Map());
  const isAdmin = me?.role === 'ADMIN';

  const [find, setFind] = useState('');
  const [sift, setSift] = useState<Sift>('all');
  const [order, setOrder] = useState<Order>('name');

  const load = useCallback(async () => {
    try {
      // Everyone in one request, including those she has removed: the filters
      // below are then instant, and toggling one costs nothing.
      setStudents(await api.get<Student[]>('/students?includeDeleted=true'));

      // An administrator also needs to know who teaches whom, and who else
      // there is. Both are her own school's, from her own school's routes.
      if (isAdmin) {
        const [staff, roster] = await Promise.all([
          api.get<Teacher[]>('/school/teachers'),
          api.get<AssignableStudent[]>('/school/students'),
        ]);
        setTeachers(staff.filter((teacher) => !teacher.isDeleted && teacher.status === 'ACTIVE'));
        setAssigned(new Map(roster.map((row) => [row.id, row.assignedTeacherId])));
      }
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.push('/login');
        return;
      }
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Your students could not be loaded. Check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [router, isAdmin]);

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
      setTemporary({ name: student.fullName, password: result.temporaryPassword });
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : 'The password could not be reset.',
      );
    } finally {
      setBusyId(null);
    }
  }

  const counts = useMemo(() => {
    const all = students ?? [];
    return {
      // What the Everyone filter shows, which holds back the removed — a chip
      // whose number does not match its own list is worse than no number.
      all: all.filter((s) => !s.isDeleted).length,
      signin: all.filter((s) => canSignIn(s)).length,
      disabled: all.filter((s) => !s.isDeleted && s.status === 'DISABLED').length,
      removed: all.filter((s) => s.isDeleted).length,
      noemail: all.filter((s) => !s.isDeleted && !s.email).length,
      temporary: all.filter((s) => !s.isDeleted && s.mustChangePassword).length,
    };
  }, [students]);

  const shown = useMemo(() => {
    const needle = find.trim().toLowerCase();
    const matches = (s: Student) =>
      needle === '' ||
      s.fullName.toLowerCase().includes(needle) ||
      s.username.toLowerCase().includes(needle);

    const inSift = (s: Student) => {
      switch (sift) {
        case 'signin':
          return canSignIn(s);
        case 'disabled':
          return !s.isDeleted && s.status === 'DISABLED';
        case 'removed':
          return s.isDeleted;
        case 'noemail':
          return !s.isDeleted && !s.email;
        case 'temporary':
          return !s.isDeleted && s.mustChangePassword;
        default:
          // Removed students are held back unless she asks for them, so the
          // ordinary view is the class as it stands.
          return !s.isDeleted;
      }
    };

    const rank = (s: Student) => (s.isDeleted ? 2 : s.status === 'DISABLED' ? 1 : 0);

    return (students ?? [])
      .filter((s) => matches(s) && inSift(s))
      .sort((a, b) => {
        if (order === 'seen') {
          // Never signed in sorts last: it is a gap, not a very old date.
          if (a.lastLoginAt === b.lastLoginAt) return a.fullName.localeCompare(b.fullName);
          if (!a.lastLoginAt) return 1;
          if (!b.lastLoginAt) return -1;
          return b.lastLoginAt.localeCompare(a.lastLoginAt);
        }
        if (order === 'state') {
          return rank(a) - rank(b) || a.fullName.localeCompare(b.fullName);
        }
        return a.fullName.localeCompare(b.fullName);
      });
  }, [students, find, sift, order]);

  if (!me) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const chips: { key: Sift; label: string }[] = [
    { key: 'all', label: 'Everyone' },
    { key: 'signin', label: 'Can sign in' },
    { key: 'disabled', label: 'Turned off' },
    { key: 'noemail', label: 'No email' },
    { key: 'temporary', label: 'On a temporary password' },
    { key: 'removed', label: 'Removed' },
  ];

  return (
    <>
      <TeacherHeader me={me} />
      <main className="page stack">
        <div className="pagehead">
          {/* An administrator has no class of her own: these are the
              school's students, not hers. Same screen, same rules — only the
              word that would be untrue for her. */}
          <h1>{me.role === 'ADMIN' ? 'Students' : 'My students'}</h1>
          <p className="muted">
            {students
              ? `${counts.signin} of ${counts.all} can sign in`
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

        {temporary && (
          <section className="panel" data-testid="temp-password">
            <div className="panel-head">
              <h2 className="panel-title">Temporary password for {temporary.name}</h2>
              <span className="panel-note">Shown once</span>
            </div>
            <div className="panel-body stack">
              <p className="note-line">
                Give this to her now. It is not stored anywhere it can be read again, so if it is
                lost you will have to set another. She will be asked to choose her own password
                when she signs in.
              </p>
              <div className="row">
                <code className="temp">{temporary.password}</code>
                <button className="small" onClick={() => setTemporary(null)}>
                  Done
                </button>
              </div>
            </div>
          </section>
        )}

        <div className="row">
          <button className="primary" onClick={() => setAdding((open) => !open)}>
            {adding ? 'Close' : 'Add a student'}
          </button>
        </div>

        {adding && (
          <AddStudentForm
            teachers={teachers}
            chooseTeacher={isAdmin}
            onAdded={(name) => {
              setAdding(false);
              setNotice(`${name} was added. Give her the password you chose.`);
              void load();
            }}
            onError={setError}
          />
        )}

        {students && counts.all === 0 && !loading ? (
          <section className="panel">
            <div className="panel-body stack">
              <p className="note-line">
                You have no students yet. Add the first one and give her the username and password
                you choose — she picks her own password the first time she signs in.
              </p>
            </div>
          </section>
        ) : (
          <>
            <div className="sieve">
              <div className="field">
                <label className="sr-only" htmlFor="findStudent">
                  Search by name or username
                </label>
                <input
                  id="findStudent"
                  type="search"
                  placeholder="Search by name or username"
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                />
              </div>
              <div className="chips">
                {chips.map((chip) => (
                  <button
                    key={chip.key}
                    className="chip"
                    aria-pressed={sift === chip.key}
                    onClick={() => setSift(chip.key)}
                  >
                    {chip.label}
                    <span className="num">{counts[chip.key]}</span>
                  </button>
                ))}
              </div>
            </div>

            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">
                  {shown.length} {shown.length === 1 ? 'student' : 'students'}
                </h2>
                <label className="panel-sort">
                  <span>Sort by</span>
                  <select value={order} onChange={(e) => setOrder(e.target.value as Order)}>
                    <option value="name">Name</option>
                    <option value="seen">Last signed in</option>
                    <option value="state">Account state</option>
                  </select>
                </label>
              </div>

              {loading ? (
                <div className="panel-body">
                  <p className="muted">Loading…</p>
                </div>
              ) : shown.length === 0 ? (
                <div className="panel-body">
                  <p className="note-line">
                    Nobody matches that. Clear the search, or choose Everyone.
                  </p>
                </div>
              ) : (
                <ul className="pupillist">
                  {shown.map((student) => (
                    <StudentRow
                      key={student.id}
                      student={student}
                      open={openId === student.id}
                      editing={editing === student.id}
                      busy={busyId === student.id}
                      onToggle={() =>
                        setOpenId((current) => (current === student.id ? null : student.id))
                      }
                      onProgress={() => router.push(`/progress/${student.id}`)}
                      onEdit={() => setEditing(student.id)}
                      onEditDone={(name) => {
                        setEditing(null);
                        if (name) setNotice(`${name}'s details were saved.`);
                        void load();
                      }}
                      onError={setError}
                      onReset={() => void resetPassword(student)}
                      onDisable={() =>
                        void act(
                          student,
                          () => api.post(`/students/${student.id}/disable`),
                          `${student.fullName} can no longer sign in.`,
                        )
                      }
                      onEnable={() =>
                        void act(
                          student,
                          () => api.post(`/students/${student.id}/enable`),
                          `${student.fullName} can sign in again.`,
                        )
                      }
                      onRemove={() =>
                        void act(
                          student,
                          () => api.del(`/students/${student.id}`),
                          `${student.fullName} was removed from your list. Nothing was deleted.`,
                        )
                      }
                      onRestore={() =>
                        void act(
                          student,
                          () => api.post(`/students/${student.id}/restore`),
                          `${student.fullName} is back on your list.`,
                        )
                      }
                      teachers={isAdmin ? teachers : []}
                      teacherId={assigned.get(student.id) ?? null}
                      onMoved={(name) => {
                        setNotice(
                          name === 'nobody'
                            ? `${student.fullName} now has no teacher.`
                            : `${student.fullName} is now ${name}'s student.`,
                        );
                        void load();
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </>
  );
}

/** Whether this account could sign in right now. */
function canSignIn(student: Student): boolean {
  return !student.isDeleted && student.status === 'ACTIVE';
}

/** How her password is looked after, which depends on whether she has an email. */
function recovery(student: Student): string {
  return student.email
    ? 'She can reset her own password by email.'
    : 'She has no email, so you set a new password for her when she needs one.';
}

function when(iso: string | null): string {
  if (!iso) return 'Never signed in';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'Signed in today';
  if (days === 1) return 'Signed in yesterday';
  if (days < 30) return `Signed in ${days} days ago`;
  return `Signed in on ${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

/**
 * One student's account.
 *
 * Closed, it says who she is and whether she can sign in. Opened, it offers
 * the account actions — which are kept behind the row because a teacher opens
 * this screen to look far more often than to change anything, and eight
 * buttons a row invites a mis-click on the one that stops a child working.
 */
function StudentRow({
  student,
  open,
  editing,
  busy,
  onToggle,
  onProgress,
  onEdit,
  onEditDone,
  onError,
  onReset,
  onDisable,
  onEnable,
  onRemove,
  onRestore,
  teachers,
  teacherId,
  onMoved,
}: {
  student: Student;
  open: boolean;
  editing: boolean;
  busy: boolean;
  onToggle: () => void;
  onProgress: () => void;
  onEdit: () => void;
  onEditDone: (name?: string) => void;
  onError: (message: string) => void;
  onReset: () => void;
  onDisable: () => void;
  onEnable: () => void;
  onRemove: () => void;
  onRestore: () => void;
  /** Set only for a school administrator; a teacher sees none of this. */
  teachers: Teacher[];
  teacherId: string | null;
  onMoved: (teacherName: string) => void;
}) {
  const [confirming, setConfirming] = useState<'disable' | 'remove' | null>(null);
  const [moving, setMoving] = useState(false);
  const live = canSignIn(student);

  return (
    <li className="pupilrow">
      <button
        className="pupilrow-open"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`Account for ${student.fullName}`}
      >
        <span className="pupilrow-who">
          <b>{student.fullName}</b>
          <span className="pupilrow-user">{student.username}</span>
        </span>

        {/*
          Only what is out of the ordinary. An account that can sign in is the
          normal case, and a chip saying so on every row would leave the two
          that need attention looking exactly like the seven that do not.
          "Who can sign in?" is answered by the filter above, and by the
          absence of a flag here.
        */}
        <span className="pupilrow-state">
          {student.isDeleted ? (
            <span className="flag" data-tone="hidden">
              <Icon name="lock" />
              Removed
            </span>
          ) : student.status === 'DISABLED' ? (
            <span className="flag" data-tone="hidden">
              <Icon name="lock" />
              Turned off
            </span>
          ) : null}
          {!student.isDeleted && student.mustChangePassword && (
            <span className="part" data-state="gap">
              Temporary password
            </span>
          )}
        </span>

        <span className="pupilrow-seen">{when(student.lastLoginAt)}</span>
        <Icon name="back" />
      </button>

      {open && (
        <div className="pupil-account">
          <p className="note-line">
            {recovery(student)}
            {student.mustChangePassword &&
              ' She is on a temporary password and will be asked to choose her own next time she signs in.'}
          </p>

          {editing ? (
            <EditStudentForm
              student={student}
              onCancel={() => onEditDone()}
              onSaved={(name) => onEditDone(name)}
              onError={onError}
            />
          ) : confirming === 'disable' ? (
            <Confirm
              title={`Turn off ${student.fullName}'s account?`}
              body={
                <>
                  She will not be able to sign in. She stays on your list, and her progress,
                  answers and messages are all kept — you can turn the account back on at any
                  time. If she is signed in at this moment she may be able to carry on for{' '}
                  {SESSION_GRACE}, until her session runs out.
                </>
              }
              confirmLabel="Turn off the account"
              busy={busy}
              onConfirm={() => {
                setConfirming(null);
                onDisable();
              }}
              onCancel={() => setConfirming(null)}
            />
          ) : confirming === 'remove' ? (
            <Confirm
              title={`Remove ${student.fullName} from your list?`}
              body={
                <>
                  She will not be able to sign in and will no longer appear in your list.{' '}
                  <strong>Nothing is deleted</strong> — her progress, her answers and your
                  messages are all kept, and you can bring her back from the Removed filter. If
                  she is signed in at this moment she may be able to carry on for {SESSION_GRACE},
                  until her session runs out.
                </>
              }
              confirmLabel="Remove from my list"
              busy={busy}
              onConfirm={() => {
                setConfirming(null);
                onRemove();
              }}
              onCancel={() => setConfirming(null)}
            />
          ) : (
            <>
              {teachers.length > 0 && !student.isDeleted && (
                <MoveStudent
                  student={student}
                  teachers={teachers}
                  teacherId={teacherId}
                  open={moving}
                  onOpen={() => setMoving(true)}
                  onClose={() => setMoving(false)}
                  onMoved={(name) => {
                    setMoving(false);
                    onMoved(name);
                  }}
                  onError={onError}
                />
              )}

              <div className="pupil-does">
              <button className="small" onClick={onProgress}>
                See her progress
              </button>

              {student.isDeleted ? (
                <button className="small primary" disabled={busy} onClick={onRestore}>
                  {busy ? 'Working…' : 'Put her back on my list'}
                </button>
              ) : (
                <>
                  <button className="small" onClick={onEdit}>
                    Edit her details
                  </button>
                  <button className="small" disabled={busy} onClick={onReset}>
                    {busy ? 'Working…' : 'Set a new password'}
                  </button>
                  {live ? (
                    <button className="small" onClick={() => setConfirming('disable')}>
                      Turn off the account
                    </button>
                  ) : (
                    <button className="small primary" disabled={busy} onClick={onEnable}>
                      {busy ? 'Working…' : 'Let her sign in again'}
                    </button>
                  )}
                  <button className="small danger" onClick={() => setConfirming('remove')}>
                    Remove from my list
                  </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * A confirmation that says what will happen.
 *
 * Deliberately not a modal: it opens inside the row it belongs to, so what is
 * about to change stays visible next to the question.
 */
function Confirm({
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="confirm" role="group" aria-label={title}>
      <p className="confirm-title">{title}</p>
      <p className="confirm-body">{body}</p>
      <div className="row">
        <button className="small danger" disabled={busy} onClick={onConfirm}>
          {busy ? 'Working…' : confirmLabel}
        </button>
        <button className="small" disabled={busy} onClick={onCancel}>
          Keep it as it is
        </button>
      </div>
    </div>
  );
}

function AddStudentForm({
  onAdded,
  onError,
  teachers,
  chooseTeacher,
}: {
  onAdded: (name: string) => void;
  onError: (message: string) => void;
  /** Who she may be given to. Empty for a teacher, who is the answer herself. */
  teachers: Teacher[];
  /** True for a school administrator, who has to say whose student this is. */
  chooseTeacher: boolean;
}) {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  // '' is "not answered yet", 'none' is the deliberate "nobody yet".
  const [teacherId, setTeacherId] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);

    try {
      await api.post('/students', {
        fullName,
        username,
        password,
        ...(email.trim() ? { email: email.trim() } : {}),
        // Sent only by an administrator. A teacher's own student is hers, and
        // the API assigns her without being told.
        ...(chooseTeacher ? { assignedTeacherId: teacherId === 'none' ? null : teacherId } : {}),
      });
      onAdded(fullName);
      setFullName('');
      setUsername('');
      setPassword('');
      setEmail('');
      setTeacherId('');
    } catch (caught) {
      // A clash belongs beside the field that caused it, not at the top of
      // the page where she has to hunt for what went wrong.
      const message =
        caught instanceof ApiError ? caught.message : 'The student could not be added.';
      if (caught instanceof ApiError && caught.status === 409) setProblem(message);
      else onError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={handleSubmit} noValidate>
      <div className="panel-head">
        <h2 className="panel-title">Add a student</h2>
      </div>
      <div className="panel-body stack">
        <div className="pair">
          <div>
            <label htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="newUsername">Username</label>
            <input
              id="newUsername"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              aria-describedby="usernameHelp"
              aria-invalid={problem ? true : undefined}
              required
            />
            <p className="muted" id="usernameHelp">
              Letters, numbers, dots, dashes and underscores. This is what she types to sign in.
            </p>
          </div>
        </div>

        {problem && (
          <p className="alert error" role="alert">
            {problem}
          </p>
        )}

        <div className="pair">
          <div>
            <label htmlFor="newPassword">Password to give her</label>
            <input
              id="newPassword"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              aria-describedby="passwordHelp"
              required
            />
            <p className="muted" id="passwordHelp">
              At least 8 characters. She chooses her own the first time she signs in, so this one
              only has to last until then.
            </p>
          </div>
          <div>
            <label htmlFor="newEmail">Email (optional)</label>
            <input
              id="newEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby="emailHelp"
            />
            <p className="muted" id="emailHelp">
              With an email she can reset her own password. Without one, you set a new one for
              her — which is perfectly normal for this age group.
            </p>
          </div>
        </div>

        {chooseTeacher && (
          <div>
            <label htmlFor="assignedTeacher">Her teacher</label>
            <select
              id="assignedTeacher"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              aria-describedby="assignedTeacherHelp"
              required
            >
              <option value="" disabled>
                Choose a teacher…
              </option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.displayName}
                </option>
              ))}
              <option value="none">No teacher yet</option>
            </select>
            <p className="muted" id="assignedTeacherHelp">
              {teacherId === 'none'
                ? 'She will appear on no teacher’s list until you give her one, and will have nobody to message.'
                : 'The teacher whose list she joins. You can move her to another teacher later.'}
            </p>
          </div>
        )}

        <div className="row">
          <button
            className="primary"
            type="submit"
            disabled={
              busy ||
              !fullName.trim() ||
              !username.trim() ||
              password.length < 8 ||
              (chooseTeacher && teacherId === '')
            }
          >
            {busy ? 'Adding…' : 'Add student'}
          </button>
        </div>
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
  const [problem, setProblem] = useState<string | null>(null);

  const renaming = username.trim() !== student.username;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);

    try {
      await api.patch(`/students/${student.id}`, {
        fullName,
        username: username.trim(),
        email: email.trim(),
      });
      onSaved(fullName);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The changes could not be saved.';
      if (caught instanceof ApiError && caught.status === 409) setProblem(message);
      else onError(message);
      setBusy(false);
    }
  }

  return (
    <form className="editpupil" onSubmit={handleSubmit} noValidate>
      <div className="pair">
        <div>
          <label htmlFor={`n-${student.id}`}>Full name</label>
          <input
            id={`n-${student.id}`}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor={`u-${student.id}`}>Username</label>
          <input
            id={`u-${student.id}`}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoCapitalize="none"
            aria-invalid={problem ? true : undefined}
            aria-describedby={renaming ? `uw-${student.id}` : undefined}
            required
          />
          {renaming && (
            <p className="muted" id={`uw-${student.id}`}>
              She signs in with this, so tell her before she next tries. Her progress and
              messages follow the account, not the name.
            </p>
          )}
        </div>
      </div>

      <div>
        <label htmlFor={`e-${student.id}`}>Email (optional)</label>
        <input
          id={`e-${student.id}`}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={`ew-${student.id}`}
        />
        <p className="muted" id={`ew-${student.id}`}>
          {email.trim()
            ? 'She can use this to reset her own password.'
            : 'Leave this empty and you set new passwords for her yourself.'}
        </p>
      </div>

      {problem && (
        <p className="alert error" role="alert">
          {problem}
        </p>
      )}

      <div className="row">
        <button className="small primary" type="submit" disabled={busy || !fullName.trim()}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button className="small" type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}


/**
 * Moving one student to another teacher.
 *
 * The whole reason this exists: a school administrator could move a teacher's
 * entire class, or hand out a student who had nobody, but could not move one
 * named girl from one teacher to another — so a school with two teachers
 * could not be arranged correctly from the screens at all.
 *
 * Only the school's own teachers are offered, and the API checks that again
 * before it writes anything, so a name from another school cannot be reached
 * from here or accepted if it were.
 */
function MoveStudent({
  student,
  teachers,
  teacherId,
  open,
  onOpen,
  onClose,
  onMoved,
  onError,
}: {
  student: Student;
  teachers: Teacher[];
  teacherId: string | null;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onMoved: (teacherName: string) => void;
  onError: (message: string) => void;
}) {
  const [to, setTo] = useState(teacherId ?? '');
  const [busy, setBusy] = useState(false);
  const hers = teachers.find((teacher) => teacher.id === teacherId);

  async function move(): Promise<void> {
    const next = to === 'none' ? null : to;
    const named = next === null ? 'nobody' : teachers.find((t) => t.id === next)?.displayName;
    if (named === undefined) return;

    setBusy(true);
    try {
      await api.post(`/school/students/${student.id}/assign`, { teacherId: next });
      onMoved(named);
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'She could not be moved.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="row" style={{ marginBottom: 'var(--s3)' }}>
        <p className="muted" style={{ margin: 0 }}>
          {hers ? `Taught by ${hers.displayName}.` : 'She has no teacher yet.'}
        </p>
        <button className="small" onClick={onOpen}>
          {hers ? 'Change her teacher' : 'Give her a teacher'}
        </button>
      </div>
    );
  }

  return (
    <div className="confirm" role="group" aria-label={`Change ${student.fullName}'s teacher`}>
      <p className="confirm-title">Who teaches {student.fullName}?</p>
      <p className="confirm-body">
        Her work, marks and messages stay exactly as they are. Only who is responsible for her
        changes.
      </p>
      <div className="row">
        <label className="assign-pick">
          <span className="sr-only">Her teacher</span>
          <select value={to} disabled={busy} onChange={(event) => setTo(event.target.value)}>
            <option value="" disabled>
              Choose a teacher…
            </option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.displayName}
              </option>
            ))}
            <option value="none">No teacher</option>
          </select>
        </label>
        <button
          className="small primary"
          disabled={busy || to === '' || to === (teacherId ?? '')}
          onClick={() => void move()}
        >
          {busy ? 'Moving…' : 'Save'}
        </button>
        <button className="small" disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
