/**
 * The meadow, drawn wide enough to stand in.
 *
 * `Scene` composes each place at 400x160 — the right shape for a band across
 * the top of a card, and the wrong one for a whole screen: stretched to a
 * window it is a 2x zoom into a small drawing, not a bigger picture. So the
 * sign-in page gets the same meadow laid out for a window.
 *
 * Same vocabulary as `Scene`, deliberately, shape for shape: three depths
 * (distance, middle, foreground), the unit's own three tints, the same sun,
 * cloud, tree and house construction, the same white meadow flowers. Nothing
 * here is a new art style; it is the existing one, given room.
 *
 * Laid out to the composition the client approved: a winding path from the
 * near edge of the field climbing to a village on the far hills, a canopy
 * overhanging from the left, and the middle of the frame kept quiet — that is
 * where the form sits, and the scenery must not compete with it.
 */

const SUN = '#FFC845';
const SUN_SOFT = '#FFE3A3';
const CORAL = '#FF8F70';
const SKY_TINT = '#EAF4FF';
const PAPER = '#FFFFFF';
const LEAF = '#5BC9A6';
const INK = '#3B3159';
const BARK = '#8A6244';
/**
 * The path.
 *
 * The one colour here not already in `Scene`. A green path on green grass is
 * a shape you have to look for; the approved composition reads at a glance
 * because the way through is a different material from the field. It is a
 * light tint of the bark already in the palette, so it joins that set rather
 * than opening a new one.
 */
const SAND = '#F0E4D2';
const SAND_DEEP = '#E2D2B8';

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
      <path d="M0 26c0-15 4-24 9-31" stroke={PAPER} strokeWidth="4" fill="none" strokeLinecap="round" opacity=".5" />
      <circle cx="9" cy="-7" r="8.5" fill={PAPER} />
      <circle cx="9" cy="-7" r="3.4" fill={SUN} />
    </g>
  );
}

/** A house on the far hill, built the way `Scene`'s town builds one. */
function House({ x, y, s = 1, roof = CORAL }: { x: number; y: number; s?: number; roof?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <rect x="0" y="16" width="30" height="30" rx="3" fill={PAPER} />
      <path d="M-5 18 15 0l20 18Z" fill={roof} />
      <rect x="11" y="30" width="9" height="16" rx="2" fill={roof} opacity=".55" />
      <rect x="3" y="22" width="6" height="6" rx="1.5" fill={SUN} />
      <rect x="21" y="22" width="6" height="6" rx="1.5" fill={SUN} />
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
      <defs>
        <linearGradient id="th-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SKY_TINT} />
          <stop offset="0.55" stopColor="#F6FBFF" />
          <stop offset="1" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>

      {/* --- distance ------------------------------------------------------ */}
      <rect x="0" y="0" width="1200" height="760" fill="url(#th-sky)" />

      <circle cx="946" cy="104" r="62" fill={SUN_SOFT} opacity=".45" />
      <circle cx="946" cy="104" r="38" fill={SUN} opacity=".8" />

      <Cloud x={168} y={96} s={1.7} o={0.85} />
      <Cloud x={540} y={62} s={1.2} o={0.55} />
      <Cloud x={1020} y={188} s={1.35} o={0.5} />

      {/* Far ridge. */}
      <path
        d="M-20 356C110 300 244 288 366 316c122 28 238 18 342-26 88-37 182-40 272-14
           68 20 150 28 240 24V780H-20Z"
        fill="var(--w3)"
      />

      {/* The village the path leads to: small, far, and off to one side, so the
          eye finds it after the form rather than before it. */}
      <g opacity=".92">
        <House x={952} y={286} s={0.62} />
        <House x={1004} y={300} s={0.5} roof="#C9A0E8" />
        <House x={906} y={306} s={0.44} roof="#7FC6E8" />
      </g>

      {/* Middle hills. */}
      <path
        d="M-20 442C120 388 270 380 398 424c112 38 228 28 342-28 92-45 194-46 290-12
           62 22 120 32 190 32V780H-20Z"
        fill="var(--w2)"
      />

      {/* A tree in the middle distance, left of the form. */}
      <g transform="translate(232 320) scale(.62)">
        <rect x="-10" y="60" width="21" height="104" rx="10" fill={BARK} />
        <circle cx="0" cy="44" r="58" fill="var(--w1)" />
        <circle cx="-48" cy="72" r="38" fill="var(--w1)" />
        <circle cx="48" cy="72" r="38" fill="var(--w1)" />
        <circle cx="-22" cy="26" r="11" fill={CORAL} opacity=".7" />
        <circle cx="28" cy="52" r="9" fill={CORAL} opacity=".7" />
      </g>

      {/* --- the field ------------------------------------------------------ */}
      <path
        d="M-20 566C140 524 306 530 442 576c120 40 246 30 362-16 98-38 204-38 308-12
           48 12 94 17 130 17V780H-20Z"
        fill="var(--w1)"
      />

      {/* --- the path ------------------------------------------------------- */}
      {/*
        Wide at the near edge, narrowing as it climbs to the village. It passes
        below the middle of the frame, leaving the centre for the form.
      */}
      <path
        d="M262 790C312 698 418 632 560 584c126-43 254-84 352-136 34-18 62-36 84-54
           l10 12c-20 20-48 40-82 59-100 55-230 98-358 143-136 48-234 110-276 196Z"
        fill={SAND}
      />
      {[
        [372, 742, 30, 11],
        [452, 700, 26, 9.5],
        [536, 664, 22, 8],
        [622, 632, 19, 7],
        [706, 604, 16, 6],
        [788, 576, 13, 5],
        [864, 548, 11, 4.2],
        [930, 516, 9, 3.4],
      ].map(([cx, cy, rx, ry]) => (
        <ellipse key={cx} cx={cx} cy={cy} rx={rx} ry={ry} fill={SAND_DEEP} opacity=".7" />
      ))}

      {/* --- foreground ------------------------------------------------------ */}
      <Flower x={92} y={686} s={1.15} />
      <Flower x={238} y={732} s={1.25} />
      <Flower x={654} y={700} s={0.95} />
      <Flower x={840} y={664} s={0.8} />
      <Flower x={1018} y={700} s={0.9} />
      <Flower x={1128} y={648} s={0.7} />

      {[160, 560, 930, 1090].map((x, i) => (
        <path
          key={x}
          d={`M${x} ${744 - i * 22}c-3-20 2-33 9-42M${x + 13} ${744 - i * 22}c-2-17 0-28 5-34`}
          stroke={LEAF}
          strokeWidth="4.5"
          fill="none"
          strokeLinecap="round"
          opacity=".45"
        />
      ))}

      {/* One butterfly, on the class the rest of the world flits with. Low and
          left of centre: the middle of the frame is where the form sits, and
          a wing showing through the panel reads as a smudge on the glass. */}
      <g transform="translate(620 676) scale(1.15)">
        <g className="w-flit">
          <ellipse cx="-8" cy="-4" rx="8" ry="6" fill={CORAL} />
          <ellipse cx="8" cy="-4" rx="8" ry="6" fill={CORAL} />
          <ellipse cx="-6" cy="4" rx="6" ry="4" fill={SUN} />
          <ellipse cx="6" cy="4" rx="6" ry="4" fill={SUN} />
          <rect x="-1.2" y="-9" width="2.4" height="16" rx="1.2" fill={INK} />
          <path d="M-2-9c-3-4-6-6-9-7M2-9c3-4 6-6 9-7" stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
