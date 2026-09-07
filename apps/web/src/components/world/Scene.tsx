import type { CSSProperties } from 'react';
import type { SceneKind } from '@/lib/world';

/**
 * Five places, drawn once.
 *
 * Flat cut-paper shapes in the unit's own three tints (`--w1`, `--w2`,
 * `--w3`) plus two fixed accents — a warm sun and a coral — so every scene
 * belongs to the same world however it is coloured. They are original and
 * deliberately simple: a hill, a house, a kite, a skyline, an open book.
 * Nothing here is a character, and nothing is a sticker of something else.
 */
const SUN = '#F7B500';
const CORAL = '#FF7A59';
const PAPER = '#FFFFFF';

function Meadow() {
  return (
    <>
      <ellipse cx="60" cy="126" rx="120" ry="40" fill="var(--w2)" />
      <ellipse cx="170" cy="130" rx="110" ry="44" fill="var(--w1)" />
      {/* sprigs */}
      <path d="M40 98c0-14 4-26 12-36" stroke="var(--w1)" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="46" cy="70" rx="7" ry="12" transform="rotate(-25 46 70)" fill="var(--w1)" />
      <ellipse cx="38" cy="84" rx="6" ry="10" transform="rotate(30 38 84)" fill="var(--w1)" />
      <path d="M150 104c0-12 6-22 14-30" stroke={PAPER} strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="166" cy="76" rx="6" ry="11" transform="rotate(-20 166 76)" fill={PAPER} />
      {/* flowers */}
      <circle cx="96" cy="100" r="5" fill={PAPER} />
      <circle cx="96" cy="100" r="2" fill={SUN} />
      <circle cx="118" cy="108" r="4" fill={PAPER} />
      <circle cx="118" cy="108" r="1.6" fill={SUN} />
      {/* butterfly */}
      <g transform="translate(112 44) rotate(-12)">
        <ellipse cx="-11" cy="-6" rx="11" ry="8" fill={CORAL} />
        <ellipse cx="11" cy="-6" rx="11" ry="8" fill={CORAL} />
        <ellipse cx="-8" cy="6" rx="8" ry="6" fill={SUN} />
        <ellipse cx="8" cy="6" rx="8" ry="6" fill={SUN} />
        <rect x="-1.5" y="-12" width="3" height="22" rx="1.5" fill="var(--w1)" />
        <path d="M-2-12c-3-4-6-6-9-7M2-12c3-4 6-6 9-7" stroke="var(--w1)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </g>
      {/* cloud */}
      <path d="M22 34a9 9 0 0 1 17-4 8 8 0 0 1 15 4 6 6 0 0 1-1 12H24a6 6 0 0 1-2-12Z" fill={PAPER} />
    </>
  );
}

function Town() {
  return (
    <>
      <circle cx="160" cy="30" r="14" fill={SUN} />
      <ellipse cx="100" cy="130" rx="130" ry="36" fill="var(--w2)" />
      <path d="M0 108c40-14 80-10 120 0s60 8 80 2" stroke={PAPER} strokeWidth="5" fill="none" strokeLinecap="round" opacity=".9" />
      {/* tall house */}
      <rect x="44" y="52" width="40" height="50" rx="3" fill={PAPER} />
      <path d="M40 54 64 30l24 24Z" fill="var(--w1)" />
      <rect x="58" y="78" width="12" height="24" rx="2" fill="var(--w1)" />
      <rect x="50" y="60" width="9" height="9" rx="1.5" fill={SUN} />
      <rect x="69" y="60" width="9" height="9" rx="1.5" fill={SUN} />
      {/* small house */}
      <rect x="96" y="70" width="34" height="32" rx="3" fill={PAPER} />
      <path d="M92 72l21-18 21 18Z" fill={CORAL} />
      <rect x="108" y="84" width="10" height="18" rx="2" fill="var(--w1)" />
      {/* tree */}
      <rect x="146" y="82" width="4" height="20" rx="2" fill="var(--w1)" />
      <circle cx="148" cy="76" r="12" fill="var(--w1)" />
      <circle cx="141" cy="82" r="8" fill="var(--w1)" />
      <circle cx="156" cy="82" r="8" fill="var(--w1)" />
    </>
  );
}

function Sky() {
  return (
    <>
      <path d="M18 56a10 10 0 0 1 19-4 9 9 0 0 1 17 4 7 7 0 0 1-1 14H20a7 7 0 0 1-2-14Z" fill={PAPER} />
      <path d="M140 92a8 8 0 0 1 15-3 7 7 0 0 1 13 3 5 5 0 0 1-1 11h-26a5 5 0 0 1-1-11Z" fill={PAPER} />
      {/* kite */}
      <g transform="translate(112 46) rotate(12)">
        <path d="M0-30 24 0 0 34-24 0Z" fill="var(--w1)" />
        <path d="M0-30V34M-24 0h48" stroke={PAPER} strokeWidth="2" />
        <path d="M0 34c-6 12 6 20 0 32s8 18 2 30" stroke="var(--w1)" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M-6 52l-4 6 8 0Z" fill={CORAL} />
        <path d="M4 74l-4 6 8 0Z" fill={SUN} />
        <path d="M-2 92l-4 6 8 0Z" fill={CORAL} />
      </g>
      {/* birds */}
      <path d="M40 30c3-4 6-4 9 0M49 30c3-4 6-4 9 0" stroke="var(--w1)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d="M170 28c3-4 6-4 9 0M179 28c3-4 6-4 9 0" stroke="var(--w1)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <circle cx="30" cy="100" r="10" fill={SUN} />
    </>
  );
}

function City() {
  return (
    <>
      <circle cx="42" cy="30" r="11" fill={SUN} />
      <path d="M150 20l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill={PAPER} />
      <rect x="20" y="70" width="34" height="50" rx="3" fill="var(--w1)" />
      <rect x="60" y="46" width="42" height="74" rx="3" fill="var(--w2)" />
      <rect x="108" y="62" width="30" height="58" rx="3" fill="var(--w1)" />
      <rect x="144" y="78" width="40" height="42" rx="3" fill="var(--w2)" />
      {[
        [26, 78], [40, 78], [26, 94], [40, 94],
        [68, 56], [84, 56], [68, 72], [84, 72], [68, 88], [84, 88],
        [114, 70], [128, 70], [114, 86], [128, 86],
        [150, 86], [166, 86], [150, 102],
      ].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="8" height="8" rx="1.5" fill={PAPER} />
      ))}
      {/* pencil */}
      <g transform="translate(160 46) rotate(-40)">
        <rect x="-5" y="-26" width="10" height="40" rx="2" fill={SUN} />
        <rect x="-5" y="-26" width="10" height="6" rx="2" fill={CORAL} />
        <path d="M-5 14 0 24l5-10Z" fill={PAPER} />
        <path d="M-2 20 0 24l2-4Z" fill="var(--w1)" />
      </g>
    </>
  );
}

function Journal() {
  return (
    <>
      <path d="M100 40c-20-10-44-10-64-2v70c20-8 44-8 64 2Z" fill={PAPER} />
      <path d="M100 40c20-10 44-10 64-2v70c-20-8-44-8-64 2Z" fill={PAPER} />
      <rect x="97" y="38" width="6" height="74" rx="3" fill="var(--w1)" />
      {[54, 66, 78, 90].map((y) => (
        <path key={y} d={`M46 ${y}c14-4 28-4 44 0`} stroke="var(--w3)" strokeWidth="3" fill="none" strokeLinecap="round" />
      ))}
      {[54, 66, 78].map((y) => (
        <path key={y} d={`M110 ${y}c14-4 28-4 44 0`} stroke="var(--w3)" strokeWidth="3" fill="none" strokeLinecap="round" />
      ))}
      {/* leaf bookmark */}
      <ellipse cx="140" cy="96" rx="7" ry="14" transform="rotate(30 140 96)" fill="var(--w2)" />
      <path d="M133 108c4-8 8-14 14-22" stroke="var(--w1)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <path d="M38 24l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5Z" fill={SUN} />
      <circle cx="166" cy="30" r="5" fill={CORAL} />
    </>
  );
}

const SCENES: Record<SceneKind, () => React.JSX.Element> = {
  meadow: Meadow, town: Town, sky: Sky, city: City, journal: Journal,
};

export function Scene({ kind, className = 'scene', style }: { kind: SceneKind; className?: string; style?: CSSProperties }) {
  const Draw = SCENES[kind];
  return (
    <svg className={className} style={style} viewBox="0 0 200 120" aria-hidden="true" focusable="false">
      <Draw />
    </svg>
  );
}

/**
 * The same five places as a mark the size of a coin, for the stations on
 * the trail and the badge on a card: a leaf, a house, a kite, a building,
 * a book.
 */
export function Glyph({ kind, size = 22 }: { kind: SceneKind; size?: number }) {
  const inner: Record<SceneKind, React.JSX.Element> = {
    meadow: (
      <>
        <path d="M12 21c-1-8 2-14 9-17-1 8-3 13-9 17Z" fill="currentColor" />
        <path d="M12 21c0-5 1-9 4-12" stroke="var(--w3)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      </>
    ),
    town: (
      <>
        <path d="M4 11 12 4l8 7v9H4Z" fill="currentColor" />
        <rect x="10" y="13" width="4" height="7" rx="1" fill="var(--w3)" />
      </>
    ),
    sky: (
      <>
        <path d="M12 3l7 8-7 9-7-9Z" fill="currentColor" />
        <path d="M12 3v17M5 11h14" stroke="var(--w3)" strokeWidth="1.2" />
      </>
    ),
    city: (
      <>
        <rect x="4" y="9" width="7" height="12" rx="1" fill="currentColor" />
        <rect x="13" y="4" width="7" height="17" rx="1" fill="currentColor" />
        <rect x="15" y="7" width="3" height="3" fill="var(--w3)" />
        <rect x="15" y="12" width="3" height="3" fill="var(--w3)" />
        <rect x="6" y="12" width="3" height="3" fill="var(--w3)" />
      </>
    ),
    journal: (
      <>
        <path d="M12 6C10 4.6 7.5 4.5 4 5.4V18c3.5-.9 6-.8 8 .6 2-1.4 4.5-1.5 8-.6V5.4c-3.5-.9-6-.8-8 .6Z" fill="currentColor" />
        <path d="M12 6v13" stroke="var(--w3)" strokeWidth="1.5" />
      </>
    ),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {inner[kind]}
    </svg>
  );
}
