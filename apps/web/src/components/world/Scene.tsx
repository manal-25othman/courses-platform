import type { CSSProperties } from 'react';
import type { SceneKind } from '@/lib/world';

/**
 * Five places, drawn once.
 *
 * Each is built in three depths — distance, middle, foreground — so it reads
 * as somewhere rather than as a pattern: hills behind, the subject in the
 * middle, grass and flowers in front. Everything is flat cut-paper shapes in
 * the unit's own three tints (`--w1` deep, `--w2` mid, `--w3` light) plus a
 * small fixed set of accents, so a scene belongs to the same world however it
 * is coloured, and a new unit costs no new artwork.
 *
 * They are inline SVG on purpose: no image file to download, no library, and
 * the whole set recolours with one CSS variable. The foreground band is marked
 * so a phone can drop it; the rest scales.
 */
const SUN = '#FFC845';
const SUN_SOFT = '#FFE3A3';
const CORAL = '#FF8F70';
const SKY_TINT = '#EAF4FF';
const PAPER = '#FFFFFF';
const LEAF = '#5BC9A6';
const INK = '#3B3159';

/** A cloud, sized and placed. Used by every outdoor scene. */
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

function Meadow() {
  return (
    <>
      {/* distance: sun, clouds, far hills */}
      <circle cx="330" cy="34" r="20" fill={SUN_SOFT} />
      <circle cx="330" cy="34" r="13" fill={SUN} />
      <Cloud x={40} y={16} s={1.1} o={0.95} />
      <Cloud x={210} y={10} s={0.8} o={0.8} />
      <path d="M-10 108c40-26 86-30 128-12 36 15 74 10 112-10 30-16 60-18 90-6v90H-10Z" fill="var(--w3)" />
      {/* middle: hills and a tree */}
      <path d="M-10 126c48-22 92-24 132-6 34 15 70 12 106-6 28-14 56-14 82-2v48H-10Z" fill="var(--w2)" />
      <rect x="286" y="96" width="7" height="34" rx="3" fill="#8A6244" />
      <circle cx="289" cy="90" r="22" fill="var(--w1)" />
      <circle cx="270" cy="100" r="15" fill="var(--w1)" />
      <circle cx="308" cy="100" r="15" fill="var(--w1)" />
      <circle cx="278" cy="84" r="5" fill={CORAL} opacity=".8" />
      <circle cx="300" cy="94" r="4" fill={CORAL} opacity=".8" />
      {/* butterflies */}
      <g transform="translate(150 64)">
        <g className="w-flit">
          <ellipse cx="-8" cy="-4" rx="8" ry="6" fill={CORAL} />
          <ellipse cx="8" cy="-4" rx="8" ry="6" fill={CORAL} />
          <ellipse cx="-6" cy="4" rx="6" ry="4" fill={SUN} />
          <ellipse cx="6" cy="4" rx="6" ry="4" fill={SUN} />
          <rect x="-1.2" y="-9" width="2.4" height="16" rx="1.2" fill={INK} />
          <path d="M-2-9c-3-4-6-6-9-7M2-9c3-4 6-6 9-7" stroke={INK} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </g>
      </g>
      <g transform="translate(92 86) scale(.62)">
        <g className="w-flit w-flit-2">
          <ellipse cx="-8" cy="-4" rx="8" ry="6" fill={SUN} />
          <ellipse cx="8" cy="-4" rx="8" ry="6" fill={SUN} />
          <rect x="-1.2" y="-9" width="2.4" height="16" rx="1.2" fill={INK} />
        </g>
      </g>
      {/* foreground: the meadow floor, grass and flowers */}
      <g className="w-fore">
        <path d="M-10 140c56-16 106-14 150 4 40 16 84 14 130-4 30-12 56-12 80-2v34H-10Z" fill="var(--w1)" />
        {[20, 64, 112, 176, 232, 300, 352].map((x, i) => (
          <g key={x} transform={`translate(${x} ${138 + (i % 3) * 4})`}>
            <path d="M0 14c0-8 2-13 5-17" stroke={PAPER} strokeWidth="2.4" fill="none" strokeLinecap="round" opacity=".55" />
            <circle cx="5" cy="-4" r="4.5" fill={PAPER} />
            <circle cx="5" cy="-4" r="1.8" fill={SUN} />
          </g>
        ))}
        {[44, 140, 258, 330].map((x) => (
          <path key={x} d={`M${x} 158c-1-9 1-15 4-19M${x + 6} 158c-1-8 0-13 2-16`} stroke={LEAF} strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".7" />
        ))}
      </g>
    </>
  );
}

function Town() {
  return (
    <>
      <circle cx="52" cy="32" r="19" fill={SUN_SOFT} />
      <circle cx="52" cy="32" r="12" fill={SUN} />
      <Cloud x={150} y={12} s={1} o={0.9} />
      <Cloud x={290} y={22} s={0.75} o={0.8} />
      {/* distance: a low ridge */}
      <path d="M-10 110c60-20 110-18 160 2 44 18 96 14 150-6v60H-10Z" fill="var(--w3)" />
      {/* middle: the street */}
      <g>
        {/* tall house */}
        <rect x="120" y="62" width="56" height="62" rx="4" fill={PAPER} />
        <path d="M114 64 148 34l34 30Z" fill="var(--w1)" />
        <rect x="140" y="94" width="17" height="30" rx="3" fill="var(--w1)" />
        <circle cx="154" cy="110" r="1.8" fill={SUN} />
        <rect x="127" y="74" width="13" height="13" rx="2" fill={SUN} />
        <rect x="157" y="74" width="13" height="13" rx="2" fill={SUN} />
        {/* small house */}
        <rect x="196" y="82" width="46" height="42" rx="4" fill={PAPER} />
        <path d="M190 84 219 60l29 24Z" fill={CORAL} />
        <rect x="212" y="100" width="14" height="24" rx="3" fill="var(--w1)" />
        <rect x="200" y="90" width="11" height="11" rx="2" fill={SUN} />
        {/* shop with an awning */}
        <rect x="262" y="88" width="50" height="36" rx="4" fill={PAPER} />
        <path d="M258 88h58l-6 12h-46Z" fill="var(--w1)" />
        <rect x="272" y="104" width="12" height="20" rx="2" fill="var(--w2)" />
        <rect x="292" y="104" width="12" height="12" rx="2" fill={SUN} />
        {/* trees */}
        <rect x="90" y="98" width="6" height="28" rx="3" fill="#8A6244" />
        <circle cx="93" cy="92" r="17" fill="var(--w1)" />
        <circle cx="79" cy="100" r="11" fill="var(--w1)" />
        <rect x="336" y="96" width="6" height="30" rx="3" fill="#8A6244" />
        <circle cx="339" cy="90" r="19" fill="var(--w1)" />
        {/* a bird */}
        <path d="M228 40c3-4 6-4 9 0M237 40c3-4 6-4 9 0" stroke="var(--w1)" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      {/* foreground: pavement, path and a bench-like planter */}
      <g className="w-fore">
        <path d="M-10 124h420v40H-10Z" fill="var(--w2)" />
        <path d="M40 164c30-26 90-40 150-40s120 14 150 40Z" fill="var(--w1)" opacity=".55" />
        {[70, 130, 200, 270, 330].map((x) => (
          <rect key={x} x={x} y="136" width="22" height="4" rx="2" fill={PAPER} opacity=".55" />
        ))}
        {[26, 358].map((x) => (
          <g key={x} transform={`translate(${x} 126)`}>
            <rect x="-10" y="12" width="20" height="14" rx="3" fill={CORAL} />
            <circle cx="0" cy="6" r="9" fill={LEAF} />
            <circle cx="-8" cy="11" r="6" fill={LEAF} />
            <circle cx="8" cy="11" r="6" fill={LEAF} />
          </g>
        ))}
      </g>
    </>
  );
}

function Sky() {
  return (
    <>
      {/* distance: layered clouds */}
      <Cloud x={20} y={30} s={1.4} o={0.7} />
      <Cloud x={300} y={18} s={1.1} o={0.7} />
      <Cloud x={170} y={96} s={0.9} o={0.55} />
      <circle cx="58" cy="118" r="24" fill={SUN_SOFT} opacity=".8" />
      <circle cx="58" cy="118" r="15" fill={SUN} opacity=".9" />
      {/* middle: the kite, high and tilted */}
      <g transform="translate(214 62)">
        <g className="w-sway">
        <path d="M0-34 27 0 0 38-27 0Z" fill="var(--w1)" />
        <path d="M0-34V38M-27 0h54" stroke={PAPER} strokeWidth="2.2" />
        <path d="M0 38c-7 13 7 22 0 35s9 20 3 33" stroke="var(--w1)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <path d="M-7 58l-5 7 9 1Z" fill={CORAL} />
        <path d="M3 82l-5 7 9 1Z" fill={SUN} />
        </g>
      </g>
      {/* hobby hints, scattered like things she likes */}
      <g transform="translate(104 44)">
        {/* music */}
        <circle cx="0" cy="14" r="5" fill={CORAL} />
        <rect x="4" y="-4" width="2.6" height="18" rx="1.3" fill={CORAL} />
        <path d="M4.6-4c6 1 10 3 12 6" stroke={CORAL} strokeWidth="2.6" fill="none" strokeLinecap="round" />
      </g>
      <g transform="translate(318 78)">
        {/* an open book */}
        <path d="M0 0c-9-5-20-5-29-1v20c9-4 20-4 29 1Z" fill={PAPER} />
        <path d="M0 0c9-5 20-5 29-1v20c-9-4-20-4-29 1Z" fill={PAPER} />
        <path d="M-1-1h2v22h-2z" fill="var(--w1)" />
      </g>
      <g transform="translate(58 62)">
        {/* a ball: two seams, so it is a ball and not a plus sign */}
        <circle cx="0" cy="0" r="12" fill={PAPER} />
        <path d="M-11 4c7-5 15-5 22 0M-8-8c5 4 8 10 8 18" stroke="var(--w1)" strokeWidth="2" fill="none" strokeLinecap="round" />
      </g>
      <g transform="translate(360 40)">
        {/* a paintbrush */}
        <rect x="-2" y="-14" width="4" height="20" rx="2" fill={SUN} transform="rotate(20)" />
        <path d="M3 6l4 9-9-3Z" fill={CORAL} />
      </g>
      {/* birds and sparkles */}
      <path d="M140 24c4-5 8-5 12 0M152 24c4-5 8-5 12 0" stroke="var(--w1)" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      {[[262, 32], [92, 106], [344, 116]].map(([x, y]) => (
        <path key={`${x}`} transform={`translate(${x} ${y})`} d="M0-7l2 5 5 2-5 2-2 5-2-5-5-2 5-2Z" fill={SUN} opacity=".85" />
      ))}
      {/* foreground: a soft cloud bank she could be standing on */}
      <g className="w-fore">
        <path d="M-10 140c30-16 62-16 92 0 26 14 58 14 86 0 30-15 64-15 94 0 24 12 50 12 78 0v30H-10Z" fill="var(--w2)" />
        <path d="M-10 152c34-12 66-12 96 2 24 11 54 11 80 0 28-12 60-12 92 2 22 9 46 9 72 0v14H-10Z" fill="var(--w1)" opacity=".7" />
      </g>
    </>
  );
}

function City() {
  return (
    <>
      <circle cx="64" cy="30" r="17" fill={SUN_SOFT} />
      <circle cx="64" cy="30" r="11" fill={SUN} />
      <Cloud x={240} y={14} s={0.9} o={0.85} />
      {/* distance: pale towers */}
      <g fill="var(--w3)">
        <rect x="14" y="62" width="34" height="70" rx="3" />
        <rect x="112" y="48" width="30" height="84" rx="3" />
        <rect x="300" y="54" width="36" height="78" rx="3" />
        <rect x="352" y="70" width="30" height="62" rx="3" />
      </g>
      {/* middle: the working city */}
      <rect x="52" y="76" width="54" height="56" rx="4" fill="var(--w2)" />
      <rect x="150" y="58" width="46" height="74" rx="4" fill="var(--w1)" />
      <rect x="206" y="86" width="40" height="46" rx="4" fill="var(--w2)" />
      {/* the school: a wider building with a flag and a clock */}
      <rect x="250" y="70" width="66" height="62" rx="4" fill={PAPER} />
      <path d="M246 72 283 46l37 26Z" fill="var(--w1)" />
      <rect x="283" y="26" width="2.6" height="22" rx="1.3" fill="#8A6244" />
      <path d="M286 27h16l-5 6 5 6h-16Z" fill={CORAL} />
      <circle cx="283" cy="86" r="9" fill="var(--w3)" />
      <path d="M283 80v6l4 3" stroke="var(--w1)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <rect x="274" y="108" width="18" height="24" rx="3" fill="var(--w1)" />
      {/* windows */}
      <g fill={PAPER} opacity=".9">
        {[[60, 86], [76, 86], [92, 86], [60, 104], [76, 104], [92, 104],
          [158, 68], [176, 68], [158, 86], [176, 86], [158, 104], [176, 104],
          [214, 96], [230, 96], [214, 112]].map(([x, y]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width="10" height="10" rx="2" />
        ))}
      </g>
      <g fill={SUN}>
        {[[76, 104], [176, 86], [230, 96]].map(([x, y]) => (
          <rect key={`l${x}-${y}`} x={x} y={y} width="10" height="10" rx="2" />
        ))}
      </g>
      {/* tools of the trades, as objects rather than icons */}
      <g transform="translate(342 104) rotate(-28)">
        <rect x="-5" y="-24" width="10" height="36" rx="2" fill={SUN} />
        <rect x="-5" y="-24" width="10" height="6" rx="2" fill={CORAL} />
        <path d="M-5 12 0 22l5-10Z" fill={PAPER} />
        <path d="M-2 18 0 22l2-4Z" fill={INK} />
      </g>
      <g transform="translate(122 108)">
        {/* a doctor's case */}
        <rect x="-13" y="-9" width="26" height="19" rx="3" fill={CORAL} />
        <rect x="-4" y="-13" width="8" height="5" rx="2" fill={CORAL} />
        <path d="M-2-2h4v3h3v4h-3v3h-4v-3h-3v-4h3Z" fill={PAPER} />
      </g>
      {/* foreground: pavement, trees and a path */}
      <g className="w-fore">
        <path d="M-10 132h420v34H-10Z" fill="var(--w2)" />
        <path d="M-10 148h420v18H-10Z" fill="var(--w1)" opacity=".5" />
        {[34, 100, 200, 330].map((x) => (
          <g key={x} transform={`translate(${x} 132)`}>
            <rect x="-3" y="-16" width="6" height="18" rx="3" fill="#8A6244" />
            <circle cx="0" cy="-22" r="13" fill={LEAF} />
            <circle cx="-9" cy="-16" r="8" fill={LEAF} />
            <circle cx="9" cy="-16" r="8" fill={LEAF} />
          </g>
        ))}
        {[64, 148, 250, 356].map((x) => (
          <rect key={x} x={x} y="152" width="26" height="4" rx="2" fill={PAPER} opacity=".5" />
        ))}
      </g>
    </>
  );
}

function Journal() {
  return (
    <>
      {/* distance: a warm wall with a window */}
      <rect x="-10" y="-10" width="420" height="140" fill="var(--w3)" opacity=".55" />
      <rect x="286" y="16" width="76" height="60" rx="6" fill={SKY_TINT} />
      <path d="M286 46h76M324 16v60" stroke={PAPER} strokeWidth="4" />
      <circle cx="306" cy="34" r="7" fill={SUN} />
      {/* middle: the desk things */}
      <g transform="translate(40 44)">
        {/* stacked books */}
        <rect x="0" y="44" width="70" height="12" rx="3" fill="var(--w1)" />
        <rect x="6" y="32" width="62" height="12" rx="3" fill={CORAL} />
        <rect x="2" y="20" width="66" height="12" rx="3" fill={SUN} />
        <rect x="0" y="44" width="8" height="12" fill={PAPER} opacity=".4" />
      </g>
      {/* the open notebook, the centre of the scene */}
      <g transform="translate(190 40)">
        <path d="M0 8c-16-9-38-9-54-3v52c16-6 38-6 54 3Z" fill={PAPER} />
        <path d="M0 8c16-9 38-9 54-3v52c-16-6-38-6-54 3Z" fill={PAPER} />
        <rect x="-3" y="6" width="6" height="58" rx="3" fill="var(--w1)" />
        {[20, 30, 40, 50].map((y) => (
          <path key={y} d={`M-46 ${y}c12-3 24-3 38 0`} stroke="var(--w3)" strokeWidth="3" fill="none" strokeLinecap="round" />
        ))}
        {[20, 30, 40].map((y) => (
          <path key={`r${y}`} d={`M8 ${y}c12-3 24-3 38 0`} stroke="var(--w3)" strokeWidth="3" fill="none" strokeLinecap="round" />
        ))}
      </g>
      {/* pencil pot */}
      <g transform="translate(300 82)">
        <path d="M-16 0h32l-4 26h-24Z" fill="var(--w1)" />
        <rect x="-10" y="-24" width="5" height="26" rx="2" fill={SUN} />
        <path d="M-10-24h5l-2.5-6Z" fill={CORAL} />
        <rect x="-2" y="-30" width="5" height="32" rx="2" fill={CORAL} />
        <path d="M-2-30h5l-2.5-6Z" fill={INK} />
        <rect x="6" y="-20" width="5" height="22" rx="2" fill={LEAF} />
        <path d="M6-20h5l-2.5-6Z" fill={INK} />
      </g>
      {/* a small plant and a mug */}
      <g transform="translate(358 96)">
        <path d="M-11 0h22l-3 16h-16Z" fill={CORAL} />
        <path d="M0 0c-2-11 2-18 8-22-1 12-4 18-8 22Z" fill={LEAF} />
        <path d="M0 0c-6-8-6-15-3-20 4 8 5 14 3 20Z" fill={LEAF} />
      </g>
      <g transform="translate(96 112)">
        <rect x="-12" y="-12" width="24" height="20" rx="4" fill={PAPER} />
        <path d="M12-6h5a5 5 0 0 1 0 10h-5" stroke={PAPER} strokeWidth="3" fill="none" />
        <path d="M-6-18c0 4 2 4 2 8M2-18c0 4 2 4 2 8" stroke={PAPER} strokeWidth="2" fill="none" strokeLinecap="round" opacity=".7" />
      </g>
      {/* foreground: the desk edge and a couple of loose sheets */}
      <g className="w-fore">
        <path d="M-10 122h420v44H-10Z" fill="#C79A6D" />
        <path d="M-10 122h420v5H-10Z" fill="#E0B98E" />
        <g transform="translate(150 126) rotate(-6)">
          <rect x="0" y="0" width="54" height="26" rx="3" fill={PAPER} />
          {[8, 15].map((y) => (
            <path key={y} d={`M8 ${y}h38`} stroke="var(--w3)" strokeWidth="2.6" strokeLinecap="round" />
          ))}
        </g>
        <path d="M250 132l3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill={SUN} />
      </g>
    </>
  );
}

const SCENES: Record<SceneKind, () => React.JSX.Element> = {
  meadow: Meadow, town: Town, sky: Sky, city: City, journal: Journal,
};

export function Scene({
  kind,
  className = 'scene',
  style,
  fit = 'whole',
}: {
  kind: SceneKind;
  className?: string;
  style?: CSSProperties;
  /**
   * `whole` keeps the composition intact and lets the container show all of
   * it — the right choice almost everywhere, because a scene drawn at 2.5:1
   * and forced into a 6:1 band is not a wider picture, it is a 2x zoom into
   * the middle of one. `fill` is for the few places whose shape is close to
   * the drawing's own and which must be covered edge to edge.
   */
  fit?: 'whole' | 'fill';
}) {
  const Draw = SCENES[kind];
  return (
    <svg
      className={className}
      style={style}
      viewBox="0 0 400 160"
      preserveAspectRatio={fit === 'fill' ? 'xMidYMax slice' : 'xMidYMax meet'}
      aria-hidden="true"
      focusable="false"
    >
      <Draw />
    </svg>
  );
}

/**
 * The same five places as a mark the size of a coin, for the stations on the
 * trail and the badge on a card: a leaf, a house, a kite, a building, a book.
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
