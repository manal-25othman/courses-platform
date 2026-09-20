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
          <stop offset="0.72" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>

      {/* High and left of the panel, so nothing covers it. */}
      <circle cx="742" cy="112" r="58" fill={SUN_SOFT} opacity=".5" />
      <circle cx="742" cy="112" r="34" fill={SUN} opacity=".92" />

      <Cloud x={286} y={92} s={1.9} o={0.7} />
      <Cloud x={452} y={72} s={1.35} o={0.55} />
      <Cloud x={906} y={168} s={1.5} o={0.42} />

      {/* Far hills, lightest tint: distance as haze. Drawn to 1220 on both
          sides so no edge of the window can ever show through. */}
      <path
        d="M-20 470C120 402 268 386 392 418c120 31 232 22 336-24 86-38 180-42 272-16
           68 19 148 26 240 22V780H-20Z"
        fill="var(--w3)"
      />

      {/* Middle hills. */}
      <path
        d="M-20 556C130 498 288 492 414 538c110 40 224 30 338-26 92-45 192-46 288-12
           62 22 120 32 180 32V780H-20Z"
        fill="var(--w2)"
      />

      {/* One tree, built the way every tree in this world is built, set in the
          middle distance where the eye passes between Lina and the panel. */}
      <g transform="translate(560 398) scale(.82)">
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
        d="M-20 648C140 610 300 616 432 658c118 38 240 30 356-16 96-38 200-39 302-13
           48 12 94 17 130 17V780H-20Z"
        fill="var(--w1)"
      />

      {/* --- the road ------------------------------------------------------- */}
      {/*
        Wide at her feet, narrowing as it goes, and it runs on toward the
        panel rather than stopping short of it -- the path continues into the
        place she is about to enter.
      */}
      <path
        d="M-20 780C10 690 140 622 300 590c170-34 366-52 594-58l146-4 0 34-144 4
           c-224 6-416 24-582 56-158 30-268 78-314 158Z"
        fill="var(--w2)"
      />
      <path
        d="M-14 742C22 664 152 612 306 586c168-28 362-46 588-52l152-4"
        stroke={PAPER}
        strokeWidth="6"
        strokeDasharray="10 16"
        fill="none"
        opacity=".7"
        strokeLinecap="round"
      />

      {/* Flowers along the near edge, thinning with distance. */}
      <Flower x={62} y={648} s={1.05} />
      <Flower x={214} y={690} s={1.2} />
      <Flower x={412} y={664} s={.86} />
      <Flower x={628} y={640} s={.74} />
      <Flower x={858} y={622} s={.64} />
      <Flower x={1074} y={648} s={.72} />

      {[186, 640, 880, 1060].map((x, i) => (
        <path
          key={x}
          d={`M${x} ${702 - i * 18}c-3-20 2-33 9-42M${x + 13} ${702 - i * 18}c-2-17 0-28 5-34`}
          stroke={LEAF}
          strokeWidth="4.5"
          fill="none"
          strokeLinecap="round"
          opacity=".5"
        />
      ))}

      {/* Two butterflies, on the class the rest of the world flits with. */}
      <g transform="translate(398 318) scale(1.35)">
        <g className="w-flit">
          <ellipse cx="-8" cy="-4" rx="8" ry="6" fill={CORAL} />
          <ellipse cx="8" cy="-4" rx="8" ry="6" fill={CORAL} />
          <ellipse cx="-6" cy="4" rx="6" ry="4" fill={SUN} />
          <ellipse cx="6" cy="4" rx="6" ry="4" fill={SUN} />
          <rect x="-1.2" y="-9" width="2.4" height="16" rx="1.2" fill={INK} />
          <path d="M-2-9c-3-4-6-6-9-7M2-9c3-4 6-6 9-7" stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </g>
      </g>
      <g transform="translate(646 262) scale(.95)">
        <g className="w-flit w-flit-2">
          <ellipse cx="-8" cy="-4" rx="8" ry="6" fill={SUN} />
          <ellipse cx="8" cy="-4" rx="8" ry="6" fill={SUN} />
          <rect x="-1.2" y="-9" width="2.4" height="16" rx="1.2" fill={INK} />
        </g>
      </g>
    </svg>
  );
}
