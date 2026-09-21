/**
 * The valley the course runs through.
 *
 * On the sign-in page she stands at the trailhead and looks down the road at
 * a village on the far hills. This is the next part of the same journey: the
 * valley she was looking at, seen from inside it. Same drawing vocabulary as
 * `Trailhead` -- one sky gradient, one sun, a few clouds, three depths of
 * hill in the place's own tints -- laid out as an open view across rather
 * than a road receding to a point, because this screen is somewhere she is
 * rather than somewhere she is about to go.
 *
 * It is fixed behind the page, so scrolling moves her down the valley instead
 * of scrolling the landscape away. Nothing here carries meaning: every fact
 * on this screen is real text in the markup above it.
 */

const SUN = '#FFC845';
const SUN_SOFT = '#FFE3A3';
const PAPER = '#FFFFFF';
const SKY_TINT = '#EAF4FF';
const CORAL = '#FF8F70';
const BARK = '#8A6244';

/** The same cloud the sign-in page uses, at the scale this drawing works in. */
function Cloud({ x, y, s = 1, o = 1 }: { x: number; y: number; s?: number; o?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      opacity={o}
      d="M0 18a11 11 0 0 1 21-5 9 9 0 0 1 17 5 7 7 0 0 1-2 14H3a7 7 0 0 1-3-14Z"
      fill={PAPER}
    />
  );
}

/** A tree, built the way every tree in this world is built. */
function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="-9" y="52" width="19" height="92" rx="9" fill={BARK} />
      <circle cx="0" cy="38" r="52" fill="var(--w1)" />
      <circle cx="-43" cy="64" r="34" fill="var(--w1)" />
      <circle cx="43" cy="64" r="34" fill="var(--w1)" />
      <circle cx="-20" cy="22" r="10" fill={CORAL} opacity=".65" />
      <circle cx="25" cy="46" r="8" fill={CORAL} opacity=".65" />
    </g>
  );
}

export function Valley() {
  return (
    <svg
      className="valley"
      viewBox="0 0 1200 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="vly-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SKY_TINT} />
          <stop offset="0.5" stopColor="#F6FBFF" />
          <stop offset="1" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width="1200" height="900" fill="url(#vly-sky)" />

      {/* The same sun as the door, higher and paler: she has walked on a
          little, and it is the same morning. Kept to the right, where the
          page puts no words and nobody stands. */}
      <circle cx="1052" cy="112" r="58" fill={SUN_SOFT} opacity=".36" />
      <circle cx="1052" cy="112" r="34" fill={SUN} opacity=".7" />

      <Cloud x={404} y={86} s={1.4} o={0.72} />
      <Cloud x={806} y={148} s={1.1} o={0.45} />
      <Cloud x={122} y={172} s={1.25} o={0.55} />

      {/* Far ridge: low and wide, so the valley reads as open. */}
      <path
        d="M-20 470C120 414 268 402 402 438c128 34 252 24 366-22 96-39 200-40 302-10
           58 17 110 25 170 25V920H-20Z"
        fill="var(--w3)"
      />

      {/* Middle hills. */}
      <path
        d="M-20 596C140 544 300 538 436 584c122 41 244 30 364-26 96-45 202-46 300-12
           54 19 78 26 140 26V920H-20Z"
        fill="var(--w2)"
      />

      <Tree x={128} y={452} s={0.5} />
      <Tree x={1064} y={486} s={0.44} />

      {/* The near field, which the page's own trail runs down. */}
      <path
        d="M-20 742C150 698 320 704 462 750c126 41 258 31 378-16 100-39 210-39 316-12
           40 10 50 14 84 14V920H-20Z"
        fill="var(--w1)"
      />
    </svg>
  );
}
