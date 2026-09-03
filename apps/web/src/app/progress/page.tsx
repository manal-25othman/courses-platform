'use client';

import { useEffect, useMemo, useState } from 'react';
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
  timeAgo,
} from '@/lib/api';
import { TeacherShell } from '@/components/TeacherShell';
import { Icon, type IconName } from '@/components/Icon';

/**
 * How the whole class is getting on.
 *
 * One call to `/progress/class`, the same service the dashboard uses, so the
 * figures are the progress engine's own rather than a second calculation.
 * Nothing here can be edited: it is a view of the students' work.
 *
 * The screen exists for comparison — thirty rows a teacher scans to find who
 * is stuck and where. The old cell packed four measurements into a line of
 * abbreviations, which cannot be read down a column, so each unit cell is now
 * a state and a bar, and the four measurements moved into the row's own
 * detail, which opens in place. Opening a student properly is still
 * /progress/[studentId]; this page does not try to be that page.
 */

type Sort = 'name' | 'progress' | 'recent';
type Filter = 'all' | 'not-started' | 'working' | 'finished' | 'attention';

/** What a unit looks like for one student, said as a state rather than a number. */
type UnitState = 'done' | 'working' | 'stuck' | 'none';

interface UnitCell {
  state: UnitState;
  label: string;
  percent: number;
  /** Parts the teacher has not built yet, which is why the unit cannot finish. */
  missing: string[];
}

/**
 * The state of one unit for one student.
 *
 * `stuck` is not a judgement and not a prediction: it is used only where the
 * server itself would refuse her the next step — the test with no tries left,
 * or a test she has taken and not passed. Everything else is simply how far
 * she has got.
 */
function cellFor(unit: StudentUnitProgress): UnitCell {
  const a = unit.assessmentState;
  const missing = unit.missingContent;

  if (unit.isComplete) {
    return { state: 'done', label: 'Finished', percent: 100, missing };
  }
  if (!a.passed && a.blockedBecause === 'no_attempts_left') {
    return { state: 'stuck', label: 'No tries left', percent: unit.overallPercent, missing };
  }
  if (!a.passed && a.attemptsUsed > 0) {
    return { state: 'stuck', label: 'Test not passed', percent: unit.overallPercent, missing };
  }
  if (unit.overallPercent === 0) {
    return { state: 'none', label: 'Not started', percent: 0, missing };
  }
  return { state: 'working', label: `${unit.overallPercent}%`, percent: unit.overallPercent, missing };
}

const STATE_ICON: Record<UnitState, IconName | null> = {
  done: 'tick',
  stuck: 'lock',
  working: null,
  none: null,
};

/** The four parts of a unit, for the detail a row opens. */
function partsOf(unit: StudentUnitProgress) {
  const a = unit.assessmentState;
  return [
    {
      key: 'Words',
      value: unit.vocabulary.empty ? 'none set' : `${unit.vocabulary.done}/${unit.vocabulary.total}`,
      state: unit.vocabulary.empty ? 'none' : unit.vocabulary.percent === 100 ? 'done' : 'part',
    },
    {
      key: 'Grammar',
      value: unit.grammar.empty ? 'none set' : `${unit.grammar.done}/${unit.grammar.total}`,
      state: unit.grammar.empty ? 'none' : unit.grammar.percent === 100 ? 'done' : 'part',
    },
    {
      key: 'Activity',
      value: unit.activity.empty
        ? 'none set'
        : unit.bestScorePercent === null
          ? 'not tried'
          : `best ${unit.bestScorePercent}%`,
      state: unit.activity.empty ? 'none' : unit.activity.percent === 100 ? 'done' : 'part',
    },
    {
      key: 'Test',
      value: a.questionCount === 0
        ? 'none set'
        : a.passed
          ? `passed, ${a.bestScorePercent ?? 0}%`
          : a.attemptsUsed === 0
            ? 'no attempt yet'
            : `${a.attemptsUsed} of ${a.maxAttempts ?? '∞'} tries, best ${a.bestScorePercent ?? 0}%`,
      state: a.questionCount === 0
        ? 'none'
        : a.passed
          ? 'done'
          : a.blockedBecause === 'no_attempts_left' || a.attemptsUsed > 0
            ? 'stuck'
            : 'part',
    },
  ] as const;
}

/** Which bucket a student falls in. Deterministic, from the same states. */
function bucketOf(row: ClassRow, core: StudentUnitProgress[]): Filter {
  if (core.length > 0 && core.every((u) => u.isComplete)) return 'finished';
  if (row.lastActivityAt === null) return 'not-started';
  return 'working';
}

function needsAttention(core: StudentUnitProgress[]): boolean {
  return core.some((u) => cellFor(u).state === 'stuck');
}

export default function ClassProgressPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [profile, setProfile] = useState<TeacherProfile | null>(null);
  const [overview, setOverview] = useState<ClassOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('name');
  const [open, setOpen] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [me]);

  useEffect(() => {
    if (!me) return;
    let live = true;
    setError(null);
    api
      .get<ClassOverview>('/progress/class')
      .then((data) => live && setOverview(data))
      .catch((caught) => {
        if (!live) return;
        // Deliberately not an empty class: an error and "no students" are
        // different facts, and showing the second for the first is a lie.
        setOverview(null);
        setError(
          caught instanceof ApiError ? caught.message : 'Your class could not be loaded.',
        );
      });
    return () => {
      live = false;
    };
  }, [me, reloadKey]);

  /** Core units only. Grammar Review is extra and appears in the detail. */
  const coreUnits = useMemo(
    () => (overview?.units ?? []).filter((u) => u.countsTowardCompletion),
    [overview],
  );

  const rows = useMemo(() => overview?.students ?? [], [overview]);

  const counts = useMemo(() => {
    const tally = { all: rows.length, 'not-started': 0, working: 0, finished: 0, attention: 0 };
    for (const row of rows) {
      const core = row.units.filter((u) => u.countsTowardCompletion);
      tally[bucketOf(row, core)] += 1;
      if (needsAttention(core)) tally.attention += 1;
    }
    return tally;
  }, [rows]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = rows.filter((row) => {
      const core = row.units.filter((u) => u.countsTowardCompletion);
      if (needle && !row.fullName.toLowerCase().includes(needle) && !row.username.toLowerCase().includes(needle)) {
        return false;
      }
      if (filter === 'all') return true;
      if (filter === 'attention') return needsAttention(core);
      return bucketOf(row, core) === filter;
    });

    return [...list].sort((a, b) => {
      if (sort === 'progress') return b.overallPercent - a.overallPercent;
      if (sort === 'recent') {
        // Never worked sorts last, whichever direction the others fall.
        const at = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : -Infinity;
        const bt = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : -Infinity;
        return bt - at;
      }
      return a.fullName.localeCompare(b.fullName);
    });
  }, [rows, query, filter, sort]);

  if (!me) {
    return (
      <main className="page">
        <div className="skeleton" style={{ height: '2rem', width: '13rem' }} />
        <div className="skeleton" style={{ height: '16rem', marginTop: '1.5rem' }} />
      </main>
    );
  }

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Everyone' },
    { key: 'attention', label: 'Worth a look' },
    { key: 'working', label: 'Working' },
    { key: 'not-started', label: 'Not started' },
    { key: 'finished', label: 'Finished' },
  ];

  function sortButton(key: Sort, label: string) {
    return (
      <button
        className="sortcol"
        onClick={() => setSort(key)}
        aria-label={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        {sort === key && (
          <span className="dir" aria-hidden="true">
            ▼
          </span>
        )}
      </button>
    );
  }

  return (
    <TeacherShell
      me={me}
      teacherTitle={profile?.title}
      title="Class progress"
      lead={
        <p className="page-lead">
          {overview === null
            ? error
              ? 'Nothing loaded.'
              : 'Loading your class…'
            : `${rows.length} ${rows.length === 1 ? 'student' : 'students'} across ${coreUnits.length} units.`}
        </p>
      }
    >
      {error && (
        <div className="alert error" role="alert">
          <p style={{ margin: 0 }}>{error}</p>
          <button
            className="small"
            style={{ marginTop: '.6rem' }}
            onClick={() => setReloadKey((n) => n + 1)}
            data-testid="retry"
          >
            Try again
          </button>
        </div>
      )}

      {overview === null && !error ? (
        <div className="panel">
          <div className="panel-body stack">
            <div className="skeleton" style={{ height: '3rem' }} />
            <div className="skeleton" style={{ height: '3rem' }} />
            <div className="skeleton" style={{ height: '3rem' }} />
          </div>
        </div>
      ) : overview === null ? null : rows.length === 0 ? (
        <div className="panel">
          <div className="blank">
            <span className="mark" aria-hidden="true">
              <Icon name="teacher" size={22} />
            </span>
            <strong>No students yet</strong>
            <p>Once your students are on the list, their progress appears here unit by unit.</p>
            <button className="primary" onClick={() => router.push('/students')}>
              Add students
            </button>
          </div>
        </div>
      ) : (
        <div className="panel">
          <div className="sieve">
            <div className="field">
              <label className="label" htmlFor="find" style={{ display: 'block' }}>
                Find a student
              </label>
              <input
                id="find"
                type="search"
                value={query}
                placeholder="Name or username"
                onChange={(e) => setQuery(e.target.value)}
                data-testid="search"
              />
            </div>
            <div className="chips" role="group" aria-label="Show">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  className="chip"
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  data-testid={`filter-${f.key}`}
                >
                  {f.label}
                  <span className="num">{counts[f.key]}</span>
                </button>
              ))}
            </div>
          </div>

          {shown.length === 0 ? (
            <div className="blank">
              <strong>No student matches</strong>
              <p>
                Nobody here fits that search or filter. Clear them to see the whole class again.
              </p>
              <button
                className="small"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                Show everyone
              </button>
            </div>
          ) : (
            <>
              {/* ------------------------------------------- desk and tablet */}
              <div className="table-wrap class-table-wrap">
                <table className="class-table" data-testid="class-table">
                  <thead>
                    <tr>
                      <th scope="col" className="col-student">{sortButton('name', 'Student')}</th>
                      <th scope="col" className="col-overall">{sortButton('progress', 'Overall')}</th>
                      {coreUnits.map((unit) => (
                        <th scope="col" key={unit.id}>
                          {unit.title}
                        </th>
                      ))}
                      <th scope="col" className="col-when">{sortButton('recent', 'Last worked')}</th>
                      <th scope="col" className="col-open">
                        <span className="hide-sm">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row) => {
                      const byTitle = new Map(row.units.map((u) => [u.title, u]));
                      const isOpen = open === row.studentId;
                      return (
                        <ClassRows
                          key={row.studentId}
                          row={row}
                          coreUnits={coreUnits}
                          byTitle={byTitle}
                          isOpen={isOpen}
                          onToggle={() => setOpen(isOpen ? null : row.studentId)}
                          onOpen={() => router.push(`/progress/${row.studentId}`)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* ------------------------------------------------- the phone */}
              <div className="panel-body class-cards">
                {shown.map((row) => {
                  const byTitle = new Map(row.units.map((u) => [u.title, u]));
                  const isOpen = open === row.studentId;
                  return (
                    <div className="sc" key={row.studentId} data-testid="class-card">
                      <button
                        className="sc-head"
                        aria-expanded={isOpen}
                        onClick={() => setOpen(isOpen ? null : row.studentId)}
                      >
                        <span className="sc-who">
                          <span className="who-name2">{row.fullName}</span>
                          <span className="who-user">
                            {row.unitsComplete} of {row.unitsCounted} units · {timeAgo(row.lastActivityAt)}
                          </span>
                        </span>
                        <span className="sc-pct">{row.overallPercent}%</span>
                        <Icon name="back" className="ico" size={16} />
                      </button>

                      <div className="sc-units">
                        {coreUnits.map((unit) => {
                          const found = byTitle.get(unit.title);
                          const cell = found ? cellFor(found) : null;
                          return (
                            <span className="sc-unit" key={unit.id}>
                              <span className="name">{unit.title}</span>
                              <span className="meter" aria-hidden="true">
                                <span style={{ width: `${cell?.percent ?? 0}%` }} />
                              </span>
                              <span className="cell-state" data-state={cell?.state ?? 'none'}>
                                {cell && STATE_ICON[cell.state] && (
                                  <Icon name={STATE_ICON[cell.state] as IconName} />
                                )}
                                {cell?.label ?? '—'}
                              </span>
                            </span>
                          );
                        })}
                      </div>

                      {isOpen && (
                        <div className="detail-in" data-testid="detail">
                          <UnitDetail row={row} />
                        </div>
                      )}

                      <div className="sc-foot">
                        <span className="muted">{row.username}</span>
                        <button
                          className="small"
                          onClick={() => router.push(`/progress/${row.studentId}`)}
                          data-testid={`open-${row.username}`}
                        >
                          Open student
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </TeacherShell>
  );
}

/** One student's row, plus the detail it opens. */
function ClassRows({
  row,
  coreUnits,
  byTitle,
  isOpen,
  onToggle,
  onOpen,
}: {
  row: ClassRow;
  coreUnits: { id: string; title: string }[];
  byTitle: Map<string, StudentUnitProgress>;
  isOpen: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <>
      <tr data-testid="class-row" data-open={isOpen}>
        <th scope="row" style={{ fontWeight: 400, borderBottom: '1px solid var(--line)' }}>
          <span className="who-cell">
            <button
              className="ghost small"
              aria-expanded={isOpen}
              aria-label={`${isOpen ? 'Hide' : 'Show'} unit detail for ${row.fullName}`}
              onClick={onToggle}
              data-testid="toggle-detail"
            >
              <Icon name="back" className="ico" size={14} />
            </button>
            <span style={{ minWidth: 0 }}>
              <span className="who-name2" style={{ display: 'block' }}>
                {row.fullName}
              </span>
              <span className="who-user">
                {row.username}
                {row.unreadFromStudent > 0 && ` · ${row.unreadFromStudent} unread`}
              </span>
            </span>
          </span>
        </th>

        <td>
          <div className="cell-unit">
            <span className="row" style={{ gap: '.5rem', flexWrap: 'nowrap' }}>
              <span className="meter" style={{ flex: 1 }}>
                <span style={{ width: `${row.overallPercent}%` }} />
              </span>
              <span className="num" style={{ fontWeight: 700 }}>
                {row.overallPercent}%
              </span>
            </span>
            <span className="cell-state">
              {row.unitsComplete} of {row.unitsCounted} units
            </span>
          </div>
        </td>

        {coreUnits.map((unit) => {
          const found = byTitle.get(unit.title);
          if (!found) {
            return (
              <td key={unit.id}>
                <span className="cell-state" data-state="none">—</span>
              </td>
            );
          }
          const cell = cellFor(found);
          const icon = STATE_ICON[cell.state];
          return (
            <td key={unit.id}>
              <div className="cell-unit">
                <span className="meter" aria-hidden="true">
                  <span style={{ width: `${cell.percent}%` }} />
                </span>
                <span className="cell-state" data-state={cell.state}>
                  {icon && <Icon name={icon} />}
                  {cell.label}
                </span>
                {cell.missing.length > 0 && (
                  <span className="not-ready" data-testid="unit-not-ready">
                    needs {cell.missing.join(', ')}
                  </span>
                )}
              </div>
            </td>
          );
        })}

        <td className="muted">{timeAgo(row.lastActivityAt)}</td>

        <td>
          <button
            className="small"
            onClick={onOpen}
            data-testid={`open-${row.username}`}
            aria-label={`Open ${row.fullName}`}
          >
            <Icon name="back" className="ico flip" size={14} />
          </button>
        </td>
      </tr>

      {isOpen && (
        <tr className="detail-row" data-testid="detail">
          <td colSpan={coreUnits.length + 4}>
            <div className="detail-in">
              <UnitDetail row={row} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * The four parts of every unit for one student.
 *
 * This is the detail a row opens, not a second copy of the student page: it
 * says where she is in each part and stops there. Units that do not count
 * towards the course are shown last and marked, so their absence from the
 * table above is not a puzzle.
 */
function UnitDetail({ row }: { row: ClassRow }) {
  const ordered = [...row.units].sort(
    (a, b) => Number(b.countsTowardCompletion) - Number(a.countsTowardCompletion),
  );

  return (
    <>
      {ordered.map((unit) => (
        <div className="detail-unit" key={unit.unitId}>
          <h4>
            {unit.title}
            {!unit.countsTowardCompletion && (
              <span className="aside-tag" style={{ marginInlineStart: '.5rem' }}>
                Extra
              </span>
            )}
          </h4>
          <div className="parts-line">
            {partsOf(unit).map((part) => (
              <span className="part" key={part.key} data-state={part.state}>
                {part.state === 'done' && <Icon name="tick" />}
                {part.key} <b>{part.value}</b>
              </span>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
