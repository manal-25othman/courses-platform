/**
 * The student's world: which scene and which colours a unit lives in.
 *
 * TOP GOAL 3 teaches four units — Living Things, Lifestyles, Interests,
 * Professions — plus Welcome and Grammar Review, which sit outside the
 * course. Each gets a place: a meadow, a town, the sky, a city, and the
 * journal the extras are written in. The place is chosen from the unit's
 * own title where it can be, so "Living Things" is a meadow on every screen
 * that shows it; a unit with an unfamiliar name takes its place from its
 * position in the course instead. Presentation only: nothing here is stored.
 */
export type SceneKind = 'meadow' | 'town' | 'sky' | 'city' | 'journal';

export interface UnitTheme {
  scene: SceneKind;
  /** Deep, mid and light tints of the place's own colour. */
  w1: string;
  w2: string;
  w3: string;
}

const PLACES: Record<SceneKind, UnitTheme> = {
  meadow:  { scene: 'meadow',  w1: '#0FA37E', w2: '#7ADBB9', w3: '#E2F8F0' },
  town:    { scene: 'town',    w1: '#F26B4E', w2: '#FFB59E', w3: '#FFEBE3' },
  sky:     { scene: 'sky',     w1: '#2E8FE0', w2: '#93CCF6', w3: '#E4F2FF' },
  city:    { scene: 'city',    w1: '#E0A100', w2: '#FFD666', w3: '#FFF3CF' },
  journal: { scene: 'journal', w1: '#8B5CF6', w2: '#C4B5FD', w3: '#EEE9FF' },
};

const BY_POSITION: SceneKind[] = ['meadow', 'town', 'sky', 'city'];

function byTitle(title: string): SceneKind | null {
  const t = title.toLowerCase();
  if (/living|animal|nature|plant/.test(t)) return 'meadow';
  if (/lifestyle|home|family|daily|food/.test(t)) return 'town';
  if (/interest|hobby|sport|music|free time/.test(t)) return 'sky';
  if (/profession|job|work|career/.test(t)) return 'city';
  if (/welcome|review|revision|grammar/.test(t)) return 'journal';
  return null;
}

export function themeFor(
  title: string,
  countsTowardCompletion: boolean,
  position?: number,
): UnitTheme {
  const named = byTitle(title);
  if (named) return PLACES[named];
  if (!countsTowardCompletion) return PLACES.journal;
  if (position !== undefined) return PLACES[BY_POSITION[position % BY_POSITION.length]];
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.charCodeAt(0)) % 9973;
  return PLACES[BY_POSITION[hash % BY_POSITION.length]];
}

/** The theme as CSS custom properties, for a `style` attribute. */
export function themeVars(theme: UnitTheme): Record<string, string> {
  return { '--w1': theme.w1, '--w2': theme.w2, '--w3': theme.w3 };
}
