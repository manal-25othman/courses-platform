/**
 * The meadow, drawn wide enough to stand in.
 *
 * `Scene` composes each place at 400x160 — the right shape for a band across
 * the top of a card, and the wrong one for a whole screen: stretched to a
 * window it is a 2x zoom into the middle of a small drawing, not a bigger
 * picture. So the sign-in page gets the same meadow laid out for a window.
 *
 * Same vocabulary, deliberately, shape for shape: the three depths `Scene`
 * builds every place from (distance, middle, foreground), the unit's own
 * three tints, the same sun and cloud and tree construction, the same white
 * flowers on the meadow floor, and the road from Grammar Adventure -- a band
 * in the mid tint with a white 8/12 dashed line down it. Nothing here is a
 * new art style; it is the existing one, given room.
 *
 * The road is the point. It starts at Lina's feet in the bottom left and runs
 * away to the right, narrowing as it goes, so the page reads as the beginning
 * of something rather than as a picture of a field.
 */

const SUN = '#FFC845';
const SUN_SOFT = '#FFE3A3';
const CORAL = '#FF8F70';
const PAPER = '#FFFFFF';
const LEAF = '#5BC9A6';
const INK = '#3B3159';

/** The same cloud `Scene` uses, at the scale this drawing works in. */
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

/** A white meadow flower with a yellow eye — the marker along every path. */
function Flower({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 26c0-15 4-24 9-31" stroke={PAPER} strokeWidth="4" fill="none" strokeLinecap="round" opacity=".55" />
      <circle cx="9" cy="-7" r="8.5" fill={PAPER} />
      <circle cx="9" cy="-7" r="3.4" fill={SUN} />
    </g>
  );
}

export function Trailhead() {
  return (
    <svg
      className="trailhead"
      viewBox="0 0 1200 760"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      {/* --- distance ---------------------------------------------------- */}
      <rect x="0" y="0" width="1200" height="760" fill="url(#sky)" />
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--w3)" />
          <stop offset="0.6" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>

      {/* High and left of the panel, so nothing covers it. */}
      <circle cx="676" cy="92" r="52" fill={SUN_SOFT} opacity=".5" />
      <circle cx="676" cy="92" r="31" fill={SUN} opacity=".92" />

      <Cloud x={214} y={74} s={1.7} o={0.65} />
      <Cloud x={868} y={62} s={1.25} o={0.5} />
      <Cloud x={1004} y={150} s={1.35} o={0.36} />

      {/* Far hills, lightest tint: distance as haze. Drawn to 1220 on both
          sides so no edge of the window can ever show through. */}
      <path
        d="M-20 372C120 306 268 290 392 322c120 31 232 22 336-24 86-38 180-42 272-16
           68 19 148 26 240 22V780H-20Z"
        fill="var(--w3)"
      />

      {/* Middle hills. */}
      <path
        d="M-20 462C130 406 288 400 414 446c110 40 224 30 338-26 92-45 192-46 288-12
           62 22 120 32 180 32V780H-20Z"
        fill="var(--w2)"
      />

      {/* One tree, built the way every tree in this world is built, set in the
          middle distance where the eye passes between Lina and the panel. */}
      <g transform="translate(486 306) scale(.7)">
        <rect x="-9" y="66" width="19" height="86" rx="9" fill="#8A6244" />
        <circle cx="0" cy="50" r="54" fill="var(--w1)" />
        <circle cx="-44" cy="76" r="35" fill="var(--w1)" />
        <circle cx="44" cy="76" r="35" fill="var(--w1)" />
        <circle cx="-20" cy="34" r="10" fill={CORAL} opacity=".75" />
        <circle cx="26" cy="58" r="8" fill={CORAL} opacity=".75" />
      </g>

      {/* --- foreground floor ---------------------------------------------- */}
      {/* Full width, explicitly: the first version ran out of curve at x=1020
          and left a white rectangle in the corner of the window. */}
      <path
        d="M-20 672C140 634 300 640 432 682c118 36 240 28 356-14 96-35 200-36 302-12
           48 11 94 16 130 16V780H-20Z"
        fill="var(--w1)"
      />

      {/* --- the road ------------------------------------------------------- */}
      {/*
        Wide at her feet, narrowing as it goes, and it runs on toward the
        panel rather than stopping short of it -- the path continues into the
        place she is about to enter.
      */}
      <path
        d="M-40 780C20 664 170 574 372 522c186-48 402-74 668-82l220-6 0 42-216 6
           c-262 8-472 34-654 80-198 50-336 138-398 240Z"
        fill="var(--w2)"
      />
      <path
        d="M-30 762C30 656 180 570 380 519c186-47 400-73 664-81l224-6"
        stroke={PAPER}
        strokeWidth="6"
        strokeDasharray="10 16"
        fill="none"
        opacity=".7"
        strokeLinecap="round"
      />

      {/* Flowers along the near edge, thinning with distance. */}
      <Flower x={110} y={716} s={1.1} />
      <Flower x={246} y={652} s={.95} />
      <Flower x={470} y={596} s={.76} />
      <Flower x={706} y={556} s={.62} />
      <Flower x={942} y={534} s={.52} />
      <Flower x={1136} y={560} s={.6} />

      {[150, 560, 830, 1064].map((x, i) => (
        <path
          key={x}
          d={`M${x} ${730 - i * 46}c-3-20 2-33 9-42M${x + 13} ${730 - i * 46}c-2-17 0-28 5-34`}
          stroke={LEAF}
          strokeWidth="4.5"
          fill="none"
          strokeLinecap="round"
          opacity=".5"
        />
      ))}

      {/* Two butterflies, on the class the rest of the world flits with. */}
      <g transform="translate(330 226) scale(1.2)">
        <g className="w-flit">
          <ellipse cx="-8" cy="-4" rx="8" ry="6" fill={CORAL} />
          <ellipse cx="8" cy="-4" rx="8" ry="6" fill={CORAL} />
          <ellipse cx="-6" cy="4" rx="6" ry="4" fill={SUN} />
          <ellipse cx="6" cy="4" rx="6" ry="4" fill={SUN} />
          <rect x="-1.2" y="-9" width="2.4" height="16" rx="1.2" fill={INK} />
          <path d="M-2-9c-3-4-6-6-9-7M2-9c3-4 6-6 9-7" stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </g>
      </g>
      <g transform="translate(566 170) scale(.85)">
        <g className="w-flit w-flit-2">
          <ellipse cx="-8" cy="-4" rx="8" ry="6" fill={SUN} />
          <ellipse cx="8" cy="-4" rx="8" ry="6" fill={SUN} />
          <rect x="-1.2" y="-9" width="2.4" height="16" rx="1.2" fill={INK} />
        </g>
      </g>
    </svg>
  );
}
