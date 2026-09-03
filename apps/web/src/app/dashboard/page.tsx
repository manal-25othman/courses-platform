'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  ApiError,
  ClassOverview,
  ClassRow,
  homeFor,
  Me,
  StudentUnitProgress,
  TeacherProfile,
} from '@/lib/api';
import { TeacherShell } from '@/components/TeacherShell';
import { Icon } from '@/components/Icon';

/**
 * Where a teacher starts.
 *
 * Everything here comes from one call to `/progress/class`, which is the same
 * service the class list and a student's own page use. That matters more than
 * it looks: the figures on this screen are the progress engine's own, not a
 * second calculation that could drift from it. Nothing is derived that the
 * API does not already say, and nothing is shown that it cannot say.
 *
 * The screen is arranged around the question a teacher actually opens it to
 * answer — who needs me today — rather than around the numbers that are
 * easiest to draw. An average tells her the class is at 31%; it does not tell
 * her which child has run out of tries on a test. So the students who need a
 * look come first and widest, and the figures sit beside them.
 */

/** How long without any recorded work before it is worth mentioning. */
const QUIET_DAYS = 7;

interface Flag {
  /** Short label for the chip. */
  label: string;
  /** The sentence under her name, naming the unit. */
  why: string;
  tone: 'help' | 'wait' | 'quiet';
  /** Lower sorts first: the most stuck student is the one to see first. */
  rank: number;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((Date.now() - then) / 86_400_000);
}

/**
 * Why this student might need a look, from signals the API already reports.
 *
 * Every one of these is a state the server computed: the assessment's own
 * `blockedBecause`, its `passed`, the grammar lock, the unread count, the
 * last-activity timestamp. There is no model here and no judgement about the
 * student — only "this is what the system says, and it is worth your eye".
 * The wording is deliberately about the work, never about the child.
 */
function flagsFor(row: ClassRow): Flag[] {
  const found: Flag[] = [];
  const core = row.units.filter((u) => u.countsTowardCompletion);

  // Nothing recorded at all. Every other signal would be derived from an
  // absence of work rather than from work that went wrong, so this is the
  // only thing worth saying about her.
  if (row.lastActivityAt === null) {
    return [{ label: 'Not started', why: 'No work recorded yet', tone: 'quiet', rank: 4 }];
  }

  for (const unit of core) {
    const a = unit.assessmentState;

    // Out of tries and not passed. The rule is the server's: two attempts,
    // highest score counts. Nothing here recalculates it.
    if (!a.passed && a.blockedBecause === 'no_attempts_left') {
      found.push({
        label: 'Test tries used',
        why: `${unit.title} — both tries used, best ${a.bestScorePercent ?? 0}%`,
        tone: 'help',
        rank: 0,
      });
      continue;
    }

    // Tried, did not reach the pass mark, still has a try left.
    if (!a.passed && a.attemptsUsed > 0) {
      found.push({
        label: 'Test not passed',
        why: `${unit.title} — best ${a.bestScorePercent ?? 0}%, needs ${a.passMarkPercent}%`,
        tone: 'help',
        rank: 1,
      });
      continue;
    }

    // The sequence is holding her up: the server will not open the grammar
    // until the words are done, so this is where she is actually stuck.
    if (unit.grammarLock.locked && !unit.vocabulary.empty && unit.vocabulary.percent < 100) {
      found.push({
        label: 'Words unfinished',
        why: `${unit.title} — ${unit.vocabulary.done} of ${unit.vocabulary.total} words`,
        tone: 'help',
        rank: 2,
      });
    }
  }

  if (row.unreadFromStudent > 0) {
    found.push({
      label: 'Waiting for a reply',
      why: `${row.unreadFromStudent} unread ${row.unreadFromStudent === 1 ? 'message' : 'messages'}`,
      tone: 'wait',
      rank: 3,
    });
  }

  const quiet = daysSince(row.lastActivityAt);
  if (quiet !== null && quiet >= QUIET_DAYS) {
    found.push({
      label: 'Quiet lately',
      why: `Nothing recorded for ${quiet} days`,
      tone: 'quiet',
      rank: 5,
    });
  }

  return found.sort((a, b) => a.rank - b.rank);
}

/** How the class is doing in one unit, averaged over the students. */
function unitSummary(rows: ClassRow[], title: string) {
  const cells = rows
    .map((r) => r.units.find((u) => u.title === title))
    .filter((u): u is StudentUnitProgress => Boolean(u));

  if (cells.length === 0) return { average: 0, complete: 0, started: 0, notStarted: 0 };

  return {
    average: Math.round(cells.reduce((sum, u) => sum + u.overallPercent, 0) / cells.length),
    complete: cells.filter((u) => u.isComplete).length,
    started: cells.filter((u) => !u.isComplete && u.overallPercent > 0).length,
    notStarted: cells.filter((u) => u.overallPercent === 0).length,
  };
}

function whenLast(iso: string | null): string {
  const days = daysSince(iso);
  if (days === null) return 'Not yet';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function TeacherDashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
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
    api.get<TeacherProfile>('/teachers/me').then(setProfile).catch(() => setProfile(null));
    api
      .get<ClassOverview>('/progress/class')
      .then(setOverview)
      .catch((caught) =>
        setError(
          caught instanceof ApiError ? caught.message : 'Your class could not be loaded.',
        ),
      );
  }, [me]);

  if (!me) {
    return (
      <main className="page">
        <div className="skeleton" style={{ height: '2rem', width: '14rem' }} />
        <div className="skeleton" style={{ height: '12rem', marginTop: '1.5rem' }} />
      </main>
    );
  }

  const rows = overview?.students ?? [];
  // Only the units that count towards the course. Grammar Review is excluded
  // by the API's own flag, not by matching on its name.
  const coreUnits = (overview?.units ?? []).filter((u) => u.countsTowardCompletion);

  const withFlags = rows
    .map((row) => ({ row, flags: flagsFor(row) }))
    .filter((s) => s.flags.length > 0)
    .sort((a, b) => a.flags[0].rank - b.flags[0].rank);

  const average =
    rows.length === 0
      ? 0
      : Math.round(rows.reduce((sum, r) => sum + r.overallPercent, 0) / rows.length);
  const finishedCourse = rows.filter(
    (r) => r.unitsCounted > 0 && r.unitsComplete === r.unitsCounted,
  ).length;
  const notStarted = rows.filter((r) => r.lastActivityAt === null).length;

  return (
    <TeacherShell
      me={me}
      teacherTitle={profile?.title}
      title="Dashboard"
      lead={
        <p className="page-lead">
          {overview === null
            ? 'Loading your class…'
            : rows.length === 0
              ? 'No students on your list yet.'
              : `${rows.length} ${rows.length === 1 ? 'student' : 'students'}. ` +
                (withFlags.length > 0
                  ? `${withFlags.length} worth a look today.`
                  : 'Nobody needs a look today.')}
        </p>
      }
    >
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}

      {overview === null && !error ? (
        <div className="dash">
          <div className="skeleton" style={{ height: '18rem' }} />
          <div className="skeleton" style={{ height: '18rem' }} />
        </div>
      ) : rows.length === 0 ? (
        <div className="panel">
          <div className="blank">
            <span className="mark" aria-hidden="true">
              <Icon name="teacher" size={22} />
            </span>
            <strong>Your class list is empty</strong>
            <p>
              Add your students and their progress will appear here as they work through the
              course.
            </p>
            <button className="primary" onClick={() => router.push('/students')}>
              Add students
            </button>
          </div>
        </div>
      ) : (
        <div className="dash">
          {/* ---------------------------------------------- who needs a look */}
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Worth a look</h2>
              <span className="panel-note">
                {withFlags.length === 0 ? 'Nobody today' : `${withFlags.length} of ${rows.length}`}
              </span>
            </div>

            {withFlags.length === 0 ? (
              <div className="blank">
                <span className="mark tick" aria-hidden="true">
                  <Icon name="tick" size={22} />
                </span>
                <strong>Everyone is moving</strong>
                <p>
                  No student is stuck on a test, held up by unfinished words, or waiting on a
                  reply.
                </p>
              </div>
            ) : (
              <ul className="attention">
                {withFlags.map(({ row, flags }) => (
                  <li key={row.studentId}>
                    <button
                      className="att"
                      onClick={() => router.push(`/progress/${row.studentId}`)}
                      data-testid="attention-row"
                    >
                      <span className="att-who">
                        <span className="att-name">{row.fullName}</span>
                        <span className="att-why">{flags[0].why}</span>
                      </span>
                      <span className="flag" data-tone={flags[0].tone}>
                        {flags[0].label}
                      </span>
                      <Icon name="back" className="ico flip" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="panel-foot">
              <button className="ghost small" onClick={() => router.push('/progress')}>
                See the whole class
                <Icon name="back" className="ico flip" />
              </button>
            </div>
          </section>

          {/* ------------------------------------------------- the figures */}
          <div className="stack">
            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">This class</h2>
              </div>
              <div className="panel-body stack">
                <div className="figure">
                  <b>{average}%</b>
                  <span>average progress across the four units</span>
                </div>
                <div className="meter" aria-label={`Class average ${average} percent`}>
                  <span style={{ width: `${average}%` }} />
                </div>
                <div className="figure-row">
                  <span className="figure">
                    <b>{finishedCourse}</b>
                    <span>finished the course</span>
                  </span>
                  <span className="figure">
                    <b>{notStarted}</b>
                    <span>not started yet</span>
                  </span>
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="panel-head">
                <h2 className="panel-title">By unit</h2>
                {/* Said once, so the absence of Grammar Review is not a puzzle. */}
                <span className="panel-note">Grammar Review is extra and not counted</span>
              </div>
              <div className="panel-body">
                {coreUnits.map((unit) => {
                  const s = unitSummary(rows, unit.title);
                  return (
                    <div className="unit-line" key={unit.id}>
                      <div className="top">
                        <span className="unit-name">{unit.title}</span>
                        <span className="unit-pct">{s.average}%</span>
                      </div>
                      <div className="meter" aria-hidden="true">
                        <span style={{ width: `${s.average}%` }} />
                      </div>
                      <span className="unit-split">
                        {s.complete} finished, {s.started} working, {s.notStarted} not started
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* ----------------------------------------------- the whole list */}
          <section className="panel">
            <div className="panel-head">
              <h2 className="panel-title">Everyone</h2>
              <span className="panel-note">Newest work first</span>
            </div>

            <div className="panel-body">
              <div className="table-wrap roster-table">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Student</th>
                      <th scope="col">Progress</th>
                      <th scope="col">Units finished</th>
                      <th scope="col">Last worked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.studentId}
                        onClick={() => router.push(`/progress/${row.studentId}`)}
                        style={{ cursor: 'pointer' }}
                        data-testid="roster-row"
                      >
                        <td>
                          <strong>{row.fullName}</strong>
                        </td>
                        <td>
                          <span className="row" style={{ gap: '.6rem', flexWrap: 'nowrap' }}>
                            <span className="meter" style={{ width: '6rem' }}>
                              <span style={{ width: `${row.overallPercent}%` }} />
                            </span>
                            <span className="num">{row.overallPercent}%</span>
                          </span>
                        </td>
                        <td className="num">
                          {row.unitsComplete} of {row.unitsCounted}
                        </td>
                        <td>{whenLast(row.lastActivityAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* On a phone the same rows read as cards: five columns squeezed
                  into 390px is how a dashboard stops being readable. */}
              <div className="roster-card">
                {rows.map((row) => (
                  <button
                    key={row.studentId}
                    className="rc"
                    onClick={() => router.push(`/progress/${row.studentId}`)}
                  >
                    <span className="rc-top">
                      <span className="rc-name">{row.fullName}</span>
                      <span className="num" style={{ fontWeight: 700 }}>
                        {row.overallPercent}%
                      </span>
                    </span>
                    <span className="meter" aria-hidden="true">
                      <span style={{ width: `${row.overallPercent}%` }} />
                    </span>
                    <span className="rc-meta">
                      <span>
                        {row.unitsComplete} of {row.unitsCounted} units
                      </span>
                      <span>{whenLast(row.lastActivityAt)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
    </TeacherShell>
  );
}
