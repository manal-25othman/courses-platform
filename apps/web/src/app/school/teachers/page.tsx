'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  ApiError,
  AssignableStudent,
  CreatedTeacher,
  homeFor,
  Me,
  SchoolSummary,
  Teacher,
} from '@/lib/api';
import { SchoolHeader } from '@/components/SchoolShell';
import { Icon } from '@/components/Icon';

/** The account states an administrator actually sifts by. */
type Sift = 'all' | 'signin' | 'disabled' | 'temporary' | 'nostudents' | 'removed';

/**
 * The staff of one school.
 *
 * Built like the teacher's own student list, because it is the same job one
 * level up: a roster to read, with the account actions kept behind each row.
 * An administrator opens this to look far more often than to change anything,
 * and a row of seven buttons invites the mis-click that stops a teacher
 * working on a Monday morning.
 *
 * The one thing this screen has that the student list does not is who teaches
 * whom. It lives here rather than on a screen of its own because "Amal has
 * nobody" and "these four children have nobody" are the same problem read
 * from two ends, and an administrator solves it in one sitting.
 */
export default function TeachersPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [school, setSchool] = useState<SchoolSummary | null>(null);
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [students, setStudents] = useState<AssignableStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [find, setFind] = useState('');
  const [sift, setSift] = useState<Sift>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [handover, setHandover] = useState<{ name: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const [staff, roster, summary] = await Promise.all([
        api.get<Teacher[]>('/school/teachers?includeRemoved=true'),
        api.get<AssignableStudent[]>('/school/students'),
        api.get<SchoolSummary>('/school/overview'),
      ]);
      setTeachers(staff);
      setStudents(roster);
      setSchool(summary);
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        router.push('/login');
        return;
      }
      setError(
        caught instanceof ApiError && caught.status === 403
          ? 'This is not available to your account.'
          : 'The teachers could not be loaded. Check your connection and try again.',
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

  /** Runs one account action, keeping the row's own busy state honest. */
  const act = useCallback(
    async (teacher: Teacher, work: () => Promise<unknown>, said: string) => {
      setBusy(teacher.id);
      setError(null);
      try {
        await work();
        setNotice(said);
        await load();
      } catch (caught) {
        setError(caught instanceof ApiError ? caught.message : 'That could not be saved.');
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  const counts = useMemo(() => {
    const all = teachers ?? [];
    // Each number is what its own chip will actually show, so a chip never
    // promises a list it does not produce.
    return {
      all: all.filter((teacher) => !teacher.isDeleted).length,
      signin: all.filter((teacher) => canSignIn(teacher)).length,
      disabled: all.filter((teacher) => !teacher.isDeleted && teacher.status === 'DISABLED')
        .length,
      temporary: all.filter((teacher) => !teacher.isDeleted && teacher.mustChangePassword).length,
      nostudents: all.filter((teacher) => !teacher.isDeleted && teacher.students === 0).length,
      removed: all.filter((teacher) => teacher.isDeleted).length,
    };
  }, [teachers]);

  const shown = useMemo(() => {
    const needle = find.trim().toLowerCase();

    const matches = (teacher: Teacher) =>
      needle === '' ||
      teacher.displayName.toLowerCase().includes(needle) ||
      teacher.username.toLowerCase().includes(needle);

    const inSift = (teacher: Teacher) => {
      switch (sift) {
        case 'signin':
          return canSignIn(teacher);
        case 'disabled':
          return !teacher.isDeleted && teacher.status === 'DISABLED';
        case 'temporary':
          return !teacher.isDeleted && teacher.mustChangePassword;
        case 'nostudents':
          return !teacher.isDeleted && teacher.students === 0;
        case 'removed':
          return teacher.isDeleted;
        default:
          return !teacher.isDeleted;
      }
    };

    return (teachers ?? [])
      .filter((teacher) => matches(teacher) && inSift(teacher))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [teachers, find, sift]);

  if (!me) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  const all = teachers ?? [];
  const live = all.filter((teacher) => canSignIn(teacher)).length;
  const unassigned = students.filter((student) => student.assignedTeacherId === null);

  const chips: { key: Sift; label: string }[] = [
    { key: 'all', label: 'Everyone' },
    { key: 'signin', label: 'Can sign in' },
    { key: 'disabled', label: 'Turned off' },
    { key: 'temporary', label: 'On a temporary password' },
    { key: 'nostudents', label: 'No students' },
    { key: 'removed', label: 'Removed' },
  ];

  return (
    <>
      <SchoolHeader me={me} schoolName={school?.schoolName} />
      <main className="page stack">
        <div className="pagehead">
          <h1>Teachers</h1>
          <p className="muted">
            {teachers
              ? `${live} of ${all.filter((teacher) => !teacher.isDeleted).length} can sign in`
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
        {notice && !handover && (
          <p className="alert ok" role="status">
            {notice}
          </p>
        )}

        {handover && (
          <section className="panel" data-testid="handover">
            <div className="panel-head">
              <h2 className="panel-title">One-time password for {handover.name}</h2>
              <span className="panel-note">Shown once</span>
            </div>
            <div className="panel-body stack">
              <p className="note-line">
                Give this to her now. It is not stored anywhere it can be read again, so if it
                is lost you will have to set another. She chooses her own password the first
                time she signs in.
              </p>
              <div className="row">
                <code className="temp">{handover.password}</code>
                <button className="small" onClick={() => setHandover(null)}>
                  Done
                </button>
              </div>
            </div>
          </section>
        )}

        {!adding && (
          <div className="row">
            <button className="primary" onClick={() => setAdding(true)}>
              Add a teacher
            </button>
          </div>
        )}

        {adding && (
          <AddTeacherForm
            onAdded={(created) => {
              setAdding(false);
              setNotice(null);
              setHandover({
                name: created.teacher.displayName,
                password: created.temporaryPassword,
              });
              void load();
            }}
            onCancel={() => setAdding(false)}
            onError={setError}
          />
        )}

        {unassigned.length > 0 && teachers && (
          <Unassigned
            students={unassigned}
            teachers={all.filter((teacher) => canSignIn(teacher))}
            onAssigned={(name, teacherName) => {
              setNotice(`${name} is now ${teacherName}'s student.`);
              void load();
            }}
            onError={setError}
          />
        )}

        {loading ? (
          <p className="muted">Loading…</p>
        ) : !teachers ? null : all.length === 0 ? (
          <section className="panel">
            <div className="panel-body">
              <p className="note-line">
                Nobody teaches here yet. Add the first teacher and you will be given a username
                and a one-time password to pass to her.
              </p>
            </div>
          </section>
        ) : (
          <>
            <div className="sieve">
              <div className="field">
                <label className="sr-only" htmlFor="findTeacher">
                  Search by name or username
                </label>
                <input
                  id="findTeacher"
                  type="search"
                  placeholder="Search by name or username"
                  value={find}
                  onChange={(event) => setFind(event.target.value)}
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

            {shown.length === 0 ? (
              <p className="muted">No teacher matches that.</p>
            ) : (
              <section className="panel">
                <ul className="pupillist">
                  {shown.map((teacher) => (
                    <TeacherRow
                      key={teacher.id}
                      teacher={teacher}
                      students={students}
                      others={all.filter(
                        (other) => canSignIn(other) && other.id !== teacher.id,
                      )}
                      open={open === teacher.id}
                      editing={editing === teacher.id}
                      busy={busy === teacher.id}
                      onToggle={() => {
                        setOpen(open === teacher.id ? null : teacher.id);
                        setEditing(null);
                      }}
                      onEdit={() => setEditing(teacher.id)}
                      onEditDone={(name) => {
                        setEditing(null);
                        if (name) {
                          setNotice(`${name}'s details were saved.`);
                          void load();
                        }
                      }}
                      onError={setError}
                      onReset={() =>
                        void act(
                          teacher,
                          async () => {
                            const result = await api.post<{ temporaryPassword: string }>(
                              `/school/teachers/${teacher.id}/reset-password`,
                            );
                            setHandover({
                              name: teacher.displayName,
                              password: result.temporaryPassword,
                            });
                          },
                          '',
                        )
                      }
                      onDisable={() =>
                        void act(
                          teacher,
                          () => api.post(`/school/teachers/${teacher.id}/disable`),
                          `${teacher.displayName} can no longer sign in.`,
                        )
                      }
                      onEnable={() =>
                        void act(
                          teacher,
                          () => api.post(`/school/teachers/${teacher.id}/enable`),
                          `${teacher.displayName} can sign in again.`,
                        )
                      }
                      onRemove={() =>
                        void act(
                          teacher,
                          () => api.del(`/school/teachers/${teacher.id}`),
                          `${teacher.displayName} was removed from the school.`,
                        )
                      }
                      onRestore={() =>
                        void act(
                          teacher,
                          () => api.post(`/school/teachers/${teacher.id}/restore`),
                          `${teacher.displayName} is back on the list.`,
                        )
                      }
                      onMoved={(count, to) => {
                        setNotice(
                          `${count} ${count === 1 ? 'student is' : 'students are'} now ${to}'s.`,
                        );
                        void load();
                      }}
                    />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}

/** Whether this account could sign in right now. */
function canSignIn(teacher: Teacher): boolean {
  return !teacher.isDeleted && teacher.status === 'ACTIVE';
}

function when(iso: string | null): string {
  if (!iso) return 'Never signed in';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'Signed in today';
  if (days === 1) return 'Signed in yesterday';
  if (days < 30) return `Signed in ${days} days ago`;
  return `Signed in on ${new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

/**
 * The children nobody is responsible for.
 *
 * Above the staff list rather than inside it, because an unassigned student
 * belongs to no row — and because this is the one thing on the screen that is
 * quietly wrong rather than merely informative.
 */
function Unassigned({
  students,
  teachers,
  onAssigned,
  onError,
}: {
  students: AssignableStudent[];
  teachers: Teacher[];
  onAssigned: (student: string, teacher: string) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  if (teachers.length === 0) {
    return (
      <p className="alert warn">
        {students.length} {students.length === 1 ? 'student has' : 'students have'} no teacher,
        and there is nobody to give them to yet. Add a teacher first.
      </p>
    );
  }

  async function assign(student: AssignableStudent, teacherId: string): Promise<void> {
    const teacher = teachers.find((candidate) => candidate.id === teacherId);
    if (!teacher) return;

    setBusy(student.id);
    try {
      await api.post(`/school/students/${student.id}/assign`, { teacherId });
      onAssigned(student.fullName, teacher.displayName);
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'She could not be assigned.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="panel" data-testid="unassigned">
      <div className="panel-head">
        <h2 className="panel-title">
          {students.length} {students.length === 1 ? 'student has' : 'students have'} no teacher
        </h2>
        <span className="panel-note">Nobody sees them on a roster</span>
      </div>
      <ul className="assignlist">
        {students.map((student) => (
          <li key={student.id}>
            <span className="assign-who">
              <b>{student.fullName}</b>
              <span>{student.username}</span>
            </span>
            <label className="assign-pick">
              <span className="sr-only">Give {student.fullName} a teacher</span>
              <select
                defaultValue=""
                disabled={busy === student.id}
                onChange={(event) => {
                  if (event.target.value) void assign(student, event.target.value);
                }}
              >
                <option value="" disabled>
                  {busy === student.id ? 'Saving…' : 'Choose a teacher…'}
                </option>
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.displayName}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One teacher's account.
 *
 * Closed, it says who she is, whether she can sign in and how many children
 * are in her care. Opened, it offers what an administrator can do about any
 * of that.
 */
function TeacherRow({
  teacher,
  students,
  others,
  open,
  editing,
  busy,
  onToggle,
  onEdit,
  onEditDone,
  onError,
  onReset,
  onDisable,
  onEnable,
  onRemove,
  onRestore,
  onMoved,
}: {
  teacher: Teacher;
  students: AssignableStudent[];
  others: Teacher[];
  open: boolean;
  editing: boolean;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onEditDone: (name?: string) => void;
  onError: (message: string) => void;
  onReset: () => void;
  onDisable: () => void;
  onEnable: () => void;
  onRemove: () => void;
  onRestore: () => void;
  onMoved: (count: number, to: string) => void;
}) {
  const [confirming, setConfirming] = useState<'disable' | 'remove' | null>(null);
  const [moving, setMoving] = useState(false);
  const live = canSignIn(teacher);
  const hers = students.filter((student) => student.assignedTeacherId === teacher.id);

  return (
    <li className="pupilrow">
      <button
        className="pupilrow-open"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`Account for ${teacher.displayName}`}
      >
        <span className="pupilrow-who">
          <b>{teacher.displayName}</b>
          <span className="pupilrow-user">{teacher.username}</span>
        </span>

        <span className="pupilrow-state">
          {/* Said in words, never by colour alone. */}
          {teacher.isDeleted ? (
            <span className="part" data-state="gap">
              Removed
            </span>
          ) : !live ? (
            <span className="part" data-state="gap">
              Turned off
            </span>
          ) : teacher.mustChangePassword ? (
            <span className="part" data-state="ready">
              Temporary password
            </span>
          ) : null}
          <span className="part" data-state="ready">
            {teacher.students} {teacher.students === 1 ? 'student' : 'students'}
          </span>
        </span>

        <span className="pupilrow-seen">{when(teacher.lastLoginAt)}</span>
        <Icon name="back" className="ico" size={15} />
      </button>

      {open && (
        <div className="pupil-account">
          {editing ? (
            <EditTeacherForm
              teacher={teacher}
              onSaved={onEditDone}
              onCancel={() => onEditDone()}
              onError={onError}
            />
          ) : confirming === 'disable' ? (
            <Confirm
              title={`Stop ${teacher.displayName} signing in?`}
              body={
                <>
                  She will be signed out and turned away at the door. Her {hers.length}{' '}
                  {hers.length === 1 ? 'student stays' : 'students stay'} assigned to her, and
                  nothing she has made is deleted. You can turn her back on at any time.
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
              title={`Remove ${teacher.displayName} from the school?`}
              body={
                <>
                  She disappears from this list and cannot sign in. Everything she wrote — her
                  lessons, her marking, her messages — is kept, and you can put her back.
                </>
              }
              confirmLabel="Remove her"
              busy={busy}
              onConfirm={() => {
                setConfirming(null);
                onRemove();
              }}
              onCancel={() => setConfirming(null)}
            />
          ) : moving ? (
            <MoveStudents
              from={teacher}
              students={hers}
              others={others}
              onMoved={(count, to) => {
                setMoving(false);
                onMoved(count, to);
              }}
              onCancel={() => setMoving(false)}
              onError={onError}
            />
          ) : (
            <>
              <dl className="pair-list">
                <div>
                  <dt>Username</dt>
                  <dd>{teacher.username}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{teacher.email ?? 'None'}</dd>
                </div>
                {teacher.title && (
                  <div>
                    <dt>Title</dt>
                    <dd>{teacher.title}</dd>
                  </div>
                )}
                <div>
                  <dt>Students</dt>
                  <dd>{teacher.students}</dd>
                </div>
              </dl>

              <p className="note-line">
                {teacher.isDeleted
                  ? 'She has been removed. Nothing she made was deleted, and putting her back restores her account as it was.'
                  : !live
                    ? 'Her account is turned off, so she cannot sign in.'
                    : teacher.mustChangePassword
                      ? 'She is on a temporary password and will be asked to choose her own next time she signs in.'
                      : 'She can reset her own password by email, and you can set a new one for her when she cannot.'}
              </p>

              <div className="pupil-does">
                {teacher.isDeleted ? (
                  <button className="small" disabled={busy} onClick={onRestore}>
                    {busy ? 'Working…' : 'Put her back'}
                  </button>
                ) : (
                  <>
                    <button className="small" disabled={busy} onClick={onEdit}>
                      Edit her details
                    </button>
                    <button className="small" disabled={busy} onClick={onReset}>
                      {busy ? 'Working…' : 'Set a new password'}
                    </button>
                    {hers.length > 0 && others.length > 0 && (
                      <button className="small" disabled={busy} onClick={() => setMoving(true)}>
                        Move her students
                      </button>
                    )}
                    {live ? (
                      <button
                        className="small danger"
                        disabled={busy}
                        onClick={() => setConfirming('disable')}
                      >
                        Turn off the account
                      </button>
                    ) : (
                      <button className="small" disabled={busy} onClick={onEnable}>
                        {busy ? 'Working…' : 'Turn the account back on'}
                      </button>
                    )}
                    <button
                      className="small danger"
                      disabled={busy || hers.length > 0}
                      onClick={() => setConfirming('remove')}
                      title={
                        hers.length > 0
                          ? 'Move her students to another teacher first'
                          : undefined
                      }
                    >
                      Remove from the school
                    </button>
                  </>
                )}
              </div>

              {!teacher.isDeleted && hers.length > 0 && (
                <p className="muted">
                  She cannot be removed while {hers.length}{' '}
                  {hers.length === 1 ? 'student is' : 'students are'} assigned to her.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

/** Hands a teacher's whole class to somebody else, so she can be removed. */
function MoveStudents({
  from,
  students,
  others,
  onMoved,
  onCancel,
  onError,
}: {
  from: Teacher;
  students: AssignableStudent[];
  others: Teacher[];
  onMoved: (count: number, to: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);

  async function move(): Promise<void> {
    const teacher = others.find((candidate) => candidate.id === to);
    if (!teacher) return;

    setBusy(true);
    try {
      // One at a time, so a failure halfway leaves the rest where they were
      // rather than in an unknown state.
      for (const student of students) {
        await api.post(`/school/students/${student.id}/assign`, { teacherId: teacher.id });
      }
      onMoved(students.length, teacher.displayName);
    } catch (caught) {
      onError(caught instanceof ApiError ? caught.message : 'They could not all be moved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="confirm" role="group" aria-label={`Move ${from.displayName}'s students`}>
      <p className="confirm-title">
        Move {students.length} {students.length === 1 ? 'student' : 'students'} to another teacher
      </p>
      <p className="confirm-body">
        Their work, marks and messages stay exactly as they are. Only who is responsible for them
        changes.
      </p>
      <div className="row">
        <label className="assign-pick">
          <span className="sr-only">Give them to</span>
          <select value={to} disabled={busy} onChange={(event) => setTo(event.target.value)}>
            <option value="" disabled>
              Choose a teacher…
            </option>
            {others.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.displayName}
              </option>
            ))}
          </select>
        </label>
        <button className="small primary" disabled={busy || !to} onClick={() => void move()}>
          {busy ? 'Moving…' : 'Move them'}
        </button>
        <button className="small" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** A confirmation that says what will happen, inside the row it belongs to. */
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

function AddTeacherForm({
  onAdded,
  onCancel,
  onError,
}: {
  onAdded: (created: CreatedTeacher) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);

    try {
      onAdded(
        await api.post<CreatedTeacher>('/school/teachers', {
          displayName: displayName.trim(),
          username: username.trim(),
          email: email.trim(),
          ...(title.trim() ? { title: title.trim() } : {}),
        }),
      );
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The teacher could not be added.';
      // A clash belongs beside the field that caused it.
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
    displayName.trim().length > 0 && username.trim().length >= 3 && email.trim().length > 0;

  return (
    <form className="panel" onSubmit={handleSubmit} noValidate>
      <div className="panel-head">
        <h2 className="panel-title">Add a teacher</h2>
      </div>
      <div className="panel-body stack">
        <div className="pair">
          <div>
            <label htmlFor="displayName">Her name</label>
            <input
              id="displayName"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              aria-describedby="displayNameHelp"
              required
            />
            <p className="muted" id="displayNameHelp">
              As her students will see it.
            </p>
          </div>
          <div>
            <label htmlFor="teacherUsername">Username</label>
            <input
              id="teacherUsername"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoCapitalize="none"
              aria-describedby="teacherUsernameHelp"
              aria-invalid={problem ? true : undefined}
              required
            />
            <p className="muted" id="teacherUsernameHelp">
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
            <label htmlFor="teacherEmail">Email</label>
            <input
              id="teacherEmail"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby="teacherEmailHelp"
              required
            />
            <p className="muted" id="teacherEmailHelp">
              Required. It is how she resets her own password without waiting for you.
            </p>
          </div>
          <div>
            <label htmlFor="teacherTitle">Title (optional)</label>
            <input
              id="teacherTitle"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ms"
              aria-describedby="teacherTitleHelp"
            />
            <p className="muted" id="teacherTitleHelp">
              Shown before her name. She can change it herself later.
            </p>
          </div>
        </div>

        <p className="note-line">
          Her first password is generated when you submit this, and shown to you once.
        </p>

        <div className="row">
          <button className="primary" type="submit" disabled={busy || !ready}>
            {busy ? 'Adding…' : 'Add teacher'}
          </button>
          <button className="small" type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}

function EditTeacherForm({
  teacher,
  onSaved,
  onCancel,
  onError,
}: {
  teacher: Teacher;
  onSaved: (name: string) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [displayName, setDisplayName] = useState(teacher.displayName);
  const [username, setUsername] = useState(teacher.username);
  const [email, setEmail] = useState(teacher.email ?? '');
  const [title, setTitle] = useState(teacher.title ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setProblem(null);

    try {
      await api.patch(`/school/teachers/${teacher.id}`, {
        displayName: displayName.trim(),
        username: username.trim(),
        email: email.trim(),
        title: title.trim(),
      });
      onSaved(displayName.trim());
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : 'Her details were not saved.';
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
    <form className="editpupil stack" onSubmit={handleSubmit} noValidate>
      <div className="pair">
        <div>
          <label htmlFor={`name-${teacher.id}`}>Her name</label>
          <input
            id={`name-${teacher.id}`}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor={`user-${teacher.id}`}>Username</label>
          <input
            id={`user-${teacher.id}`}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoCapitalize="none"
            aria-invalid={problem ? true : undefined}
            required
          />
        </div>
      </div>

      <div className="pair">
        <div>
          <label htmlFor={`email-${teacher.id}`}>Email</label>
          <input
            id={`email-${teacher.id}`}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor={`title-${teacher.id}`}>Title</label>
          <input
            id={`title-${teacher.id}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ms"
          />
        </div>
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
          disabled={busy || !displayName.trim() || username.trim().length < 3 || !email.trim()}
        >
          {busy ? 'Saving…' : 'Save her details'}
        </button>
        <button className="small" type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
