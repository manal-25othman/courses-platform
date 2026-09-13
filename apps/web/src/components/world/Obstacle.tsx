import type { CheckpointKind } from '@/lib/api';
import type { SceneKind } from '@/lib/world';

/**
 * The things that stand in the way.
 *
 * Six drawings, one per kind of checkpoint, each with two states: in the way,
 * and opened. Opening is what a right answer does — the gate swings, the
 * planks land, the correct road lights up — so the reward for knowing the
 * grammar is watching the world change, not a tick appearing.
 *
 * They are drawn in the unit's own tints like everything else, so the same
 * bridge is mint in the meadow and amber in the city.
 */
const WOOD = '#B07A4E';
const WOOD_DARK = '#8A5C36';
const IRON = '#7C6FA8';
const SUN = '#FFC845';
const CORAL = '#FF8F70';
const PAPER = '#FFFFFF';
const INK = '#3B3159';

export function Obstacle({
  kind,
  open,
  /** How many planks of a bridge are down so far. Bridges only. */
  laid = 0,
  total = 0,
  /** Which world this is, so the destination is the one she was promised. */
  scene = 'meadow',
}: {
  kind: CheckpointKind;
  open: boolean;
  laid?: number;
  total?: number;
  scene?: SceneKind;
}) {
  if (kind === 'bridge') {
    // The gap is fixed; the planks arrive one at a time as she lays them.
    const planks = Math.max(total, 1);
    return (
      <g className={open ? 'ob ob-open' : 'ob'}>
        {/* the ravine */}
        <path d="M96 108h108v52H96Z" fill="#5B4A7A" opacity=".18" />
        <path d="M96 108c8 14 10 30 8 52h-8ZM204 108c-8 14-10 30-8 52h8Z" fill="#5B4A7A" opacity=".25" />
        {/* the posts that survived */}
        <rect x="92" y="96" width="8" height="26" rx="3" fill={WOOD_DARK} />
        <rect x="200" y="96" width="8" height="26" rx="3" fill={WOOD_DARK} />
        <path d="M96 96h8M200 96h8" stroke={WOOD_DARK} strokeWidth="3" />
        {/* the planks, as far as she has got */}
        {Array.from({ length: planks }, (_, i) => {
          const w = 100 / planks;
          return (
            <rect
              key={i}
              className={i < laid ? 'plank plank-on' : 'plank'}
              x={100 + i * w + 1}
              y="104"
              width={w - 2}
              height="10"
              rx="3"
              fill={i < laid ? WOOD : 'transparent'}
              stroke={i < laid ? 'none' : WOOD_DARK}
              strokeDasharray={i < laid ? undefined : '4 4'}
              strokeWidth="2"
              opacity={i < laid ? 1 : 0.5}
            />
          );
        })}
        {open && <path d="M100 114h100" stroke={WOOD_DARK} strokeWidth="3" strokeLinecap="round" />}
      </g>
    );
  }

  if (kind === 'gate') {
    return (
      <g className={open ? 'ob ob-open' : 'ob'}>
        {/* the arch */}
        <path d="M120 120V72a40 40 0 0 1 80 0v48" stroke={IRON} strokeWidth="9" fill="none" strokeLinecap="round" />
        <circle cx="160" cy="30" r="7" fill={SUN} />
        {/* two leaves that swing apart */}
        <g className="gate-leaf gate-left">
          <rect x="124" y="74" width="34" height="46" rx="4" fill="var(--w2)" />
          <path d="M130 82v30M140 82v30M150 82v30" stroke={IRON} strokeWidth="3" strokeLinecap="round" />
          <circle cx="153" cy="98" r="3.5" fill={SUN} />
        </g>
        <g className="gate-leaf gate-right">
          <rect x="162" y="74" width="34" height="46" rx="4" fill="var(--w2)" />
          <path d="M170 82v30M180 82v30M190 82v30" stroke={IRON} strokeWidth="3" strokeLinecap="round" />
          <circle cx="167" cy="98" r="3.5" fill={SUN} />
        </g>
      </g>
    );
  }

  if (kind === 'path') {
    // A fork: the road splits, and only one branch is built.
    return (
      <g className={open ? 'ob ob-open' : 'ob'}>
        <path d="M120 150c30-6 48-22 60-46" stroke="var(--w2)" strokeWidth="16" fill="none" strokeLinecap="round" className="fork fork-up" />
        <path d="M120 150c34 2 58 4 84 8" stroke="var(--w2)" strokeWidth="16" fill="none" strokeLinecap="round" className="fork fork-down" />
        <path d="M120 150c30-6 48-22 60-46" stroke={PAPER} strokeWidth="3" strokeDasharray="7 9" fill="none" strokeLinecap="round" opacity=".7" />
        <path d="M120 150c34 2 58 4 84 8" stroke={PAPER} strokeWidth="3" strokeDasharray="7 9" fill="none" strokeLinecap="round" opacity=".7" />
        <circle cx="186" cy="100" r="9" fill={PAPER} />
        <text x="186" y="105" textAnchor="middle" fontSize="12" fontWeight="800" fill={INK}>A</text>
        <circle cx="210" cy="160" r="9" fill={PAPER} />
        <text x="210" y="165" textAnchor="middle" fontSize="12" fontWeight="800" fill={INK}>B</text>
      </g>
    );
  }

  if (kind === 'signpost') {
    return (
      <g className={open ? 'ob ob-open' : 'ob'}>
        <rect x="156" y="80" width="8" height="72" rx="3" fill={WOOD_DARK} />
        <g className="sign-board">
          <rect x="108" y="62" width="104" height="34" rx="5" fill={WOOD} />
          <rect x="113" y="67" width="94" height="24" rx="3" fill="#FFF6E6" />
          <path d="M122 79h76" stroke={WOOD_DARK} strokeWidth="3" strokeLinecap="round" opacity=".45" />
          <path d="M122 86h48" stroke={WOOD_DARK} strokeWidth="3" strokeLinecap="round" opacity=".3" />
        </g>
        <circle cx="160" cy="152" r="10" fill="var(--w2)" />
      </g>
    );
  }

  if (kind === 'backpack') {
    return (
      <g className={open ? 'ob ob-open' : 'ob'}>
        {/* the straps, behind, peeking either side of the bag */}
        <path
          d="M144 104c-11 6-13 24-10 44M176 104c11 6 13 24 10 44"
          stroke={WOOD_DARK}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
          opacity=".45"
        />
        {/* the grab loop: flat and small, so it reads as a handle */}
        <path d="M153 102v-3a7 7 0 0 1 14 0v3" stroke={WOOD_DARK} strokeWidth="4" fill="none" strokeLinecap="round" />
        <rect x="134" y="102" width="52" height="48" rx="13" fill="var(--w1)" />
        {/* the flap over the top */}
        <path d="M134 120v-5a13 13 0 0 1 13-13h26a13 13 0 0 1 13 13v5Z" fill="var(--w2)" />
        {/* the front pocket, and the buckle that catches the light */}
        <rect x="144" y="126" width="32" height="20" rx="6" fill={PAPER} opacity=".92" />
        <path d="M150 136h20" stroke="var(--w1)" strokeWidth="3" strokeLinecap="round" opacity=".5" />
        <rect x="153" y="115" width="14" height="8" rx="3" fill={SUN} className="pack-spark" />
      </g>
    );
  }

  // The destination. It has to be the thing she was told she was walking to,
  // so each world ends somewhere of its own: the oak, the library, the top of
  // the hill, the school, the last page.
  const flag = (
    <>
      <rect x="158" y="18" width="4" height="30" rx="2" fill={WOOD_DARK} />
      <path d="M162 20h26l-8 9 8 9h-26Z" fill={CORAL} className="ob-flag" />
    </>
  );

  if (scene === 'meadow') {
    return (
      <g className={open ? 'ob ob-open' : 'ob'}>
        <rect x="152" y="104" width="16" height="48" rx="6" fill={WOOD_DARK} />
        <circle cx="160" cy="88" r="44" fill="var(--w1)" />
        <circle cx="120" cy="108" r="26" fill="var(--w1)" />
        <circle cx="200" cy="108" r="26" fill="var(--w1)" />
        <circle cx="132" cy="76" r="6" fill={CORAL} opacity=".8" />
        <circle cx="186" cy="98" r="5" fill={SUN} opacity=".85" />
        {flag}
      </g>
    );
  }

  if (scene === 'sky') {
    return (
      <g className={open ? 'ob ob-open' : 'ob'}>
        <path d="M74 152c26-44 54-66 86-66s60 22 86 66Z" fill="var(--w1)" />
        <path d="M112 152c16-26 32-39 48-39s32 13 48 39Z" fill="var(--w2)" />
        {flag}
      </g>
    );
  }

  if (scene === 'journal') {
    return (
      <g className={open ? 'ob ob-open' : 'ob'}>
        <path d="M160 84c-18-10-42-10-60-4v58c18-6 42-6 60 4Z" fill={PAPER} />
        <path d="M160 84c18-10 42-10 60-4v58c-18-6-42-6-60 4Z" fill={PAPER} />
        <rect x="156" y="82" width="8" height="60" rx="4" fill="var(--w1)" />
        {[100, 112, 124].map((y) => (
          <g key={y}>
            <path d={`M112 ${y}c14-3 28-3 40 0`} stroke="var(--w3)" strokeWidth="4" fill="none" strokeLinecap="round" />
            <path d={`M168 ${y}c14-3 28-3 40 0`} stroke="var(--w3)" strokeWidth="4" fill="none" strokeLinecap="round" />
          </g>
        ))}
        {flag}
      </g>
    );
  }

  // town and city both end at a building: a library, and the school.
  return (
    <g className={open ? 'ob ob-open' : 'ob'}>
      <rect x="110" y="90" width="100" height="62" rx="5" fill={PAPER} />
      <path d="M104 92 160 56l56 36Z" fill="var(--w1)" />
      <rect x="146" y="116" width="28" height="36" rx="4" fill="var(--w1)" />
      <circle cx="167" cy="136" r="2.6" fill={SUN} />
      <rect x="120" y="104" width="18" height="16" rx="3" fill={SUN} opacity=".9" />
      <rect x="182" y="104" width="18" height="16" rx="3" fill={SUN} opacity=".9" />
      {flag}
    </g>
  );
}
