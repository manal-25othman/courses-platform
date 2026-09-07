/**
 * The ground the student's screens stand on.
 *
 * A soft sky behind everything, and a handful of paper shapes — a cloud, a
 * star, a leaf, a ring — pinned to the corners where content never sits.
 * Drawn once per page and fixed, so they do not scroll past as noise; kept
 * pale, so they are a place rather than a pattern. The teacher's screens do
 * not use this: her ground is plain on purpose.
 */
export function WorldGround() {
  return (
    <div className="world-ground" aria-hidden="true">
      <svg className="wg wg-cloud" viewBox="0 0 120 60">
        <path d="M22 44a14 14 0 0 1 26-6 12 12 0 0 1 23 6 9 9 0 0 1-1 18H25a9 9 0 0 1-3-18Z" fill="currentColor" />
      </svg>
      <svg className="wg wg-star" viewBox="0 0 40 40">
        <path d="M20 2l4 12 12 4-12 4-4 12-4-12-12-4 12-4Z" fill="currentColor" />
      </svg>
      <svg className="wg wg-leaf" viewBox="0 0 60 60">
        <path d="M10 50C8 30 20 12 50 8c-2 26-14 40-40 42Z" fill="currentColor" />
      </svg>
      <svg className="wg wg-ring" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="22" fill="none" stroke="currentColor" strokeWidth="8" />
      </svg>
      <svg className="wg wg-cloud2" viewBox="0 0 120 60">
        <path d="M22 44a14 14 0 0 1 26-6 12 12 0 0 1 23 6 9 9 0 0 1-1 18H25a9 9 0 0 1-3-18Z" fill="currentColor" />
      </svg>
    </div>
  );
}
