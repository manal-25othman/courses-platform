import { createRng, shuffle, type Rng } from '../questions/question.types';

/**
 * Grammar Adventure: turning a unit's grammar questions into a journey.
 *
 * This module holds the game's rules and nothing else — no database, no
 * framework — so the thing that decides what a round is can be tested on its
 * own. It never writes a question, never invents an answer and never names a
 * school's curriculum: it is handed questions a teacher already published and
 * decides which of them the journey stops at, and what kind of obstacle each
 * one becomes.
 *
 * The obstacle is presentation, not content. A question that asks the student
 * to order words becomes a bridge whose planks she lays; a true/false question
 * becomes a signpost that may be lying. The same stored question would work
 * just as well in the activity — which is the point. The game is a way through
 * the world, not a second copy of the curriculum.
 */

/** What the student meets at a stop on the road. */
export type CheckpointKind =
  /** A fork: two ways on, one of them written correctly. */
  | 'path'
  /** A broken bridge: the planks are words, and they go in an order. */
  | 'bridge'
  /** A locked gate: one sentence is the key. */
  | 'gate'
  /** A sign that may be telling the truth, or may not. */
  | 'signpost'
  /** Something to carry: the right word goes in the bag. */
  | 'backpack'
  /** The last stop, whatever shape it takes. */
  | 'final';

/** A question as this module needs it: already published, already presented. */
export interface AdventureSource {
  id: string;
  typeKey: string;
  prompt: string;
  /** The engine's own presented payload. Never holds the answer. */
  payload: Record<string, unknown>;
  /** True when the teacher linked it to a grammar page. */
  fromGrammarSection: boolean;
  /** The teacher's own nudge, if she wrote one. Never generated here. */
  hint: string | null;
}

export interface Checkpoint {
  /** The stored question this stop asks. Answers are checked by id. */
  questionId: string;
  kind: CheckpointKind;
  typeKey: string;
  prompt: string;
  payload: Record<string, unknown>;
  hint: string | null;
}

export interface AdventurePlan {
  checkpoints: Checkpoint[];
}

/** Too short to be a journey; below this the game is not offered. */
export const MINIMUM_CHECKPOINTS = 3;
/** Long enough to feel like a trip, short enough to finish in one sitting. */
export const MAXIMUM_CHECKPOINTS = 7;

/**
 * Which stored question kinds can become an obstacle.
 *
 * A kind is listed here when the student can answer it by pointing at
 * something in the world: choosing one of two roads, laying planks, reading a
 * sign. Typed answers are absent — not because they are worse questions, but
 * because a keyboard is not a way through a world, and the adventure is
 * played with a thumb.
 *
 * This is the fallback. A school can set `games.grammar_adventure.types` to
 * its own list, because which kinds carry grammar is a curriculum's business
 * rather than a rule in code.
 */
export const DEFAULT_ELIGIBLE_TYPES = [
  'complete_sentence',
  'true_false',
  'word_ordering',
  'multiple_choice',
] as const;

/**
 * Whether a question can be a stop on the road.
 *
 * `multiple_choice` is the loose one: a unit's multiple-choice questions are
 * as often about a word's meaning as about its grammar. So it is admitted
 * only when the teacher has tied it to a grammar page — which the curriculum
 * screen already lets her do, and which is the only signal in the data that
 * says "this question is about grammar" rather than "this question has
 * options".
 */
export function isEligible(source: AdventureSource, eligibleTypes: readonly string[]): boolean {
  if (!eligibleTypes.includes(source.typeKey)) return false;
  if (source.typeKey === 'multiple_choice') return source.fromGrammarSection;
  return true;
}

/** How many ways on this question offers, if it offers a choice at all. */
function optionCount(source: AdventureSource): number {
  const options = source.payload.options;
  return Array.isArray(options) ? options.length : 0;
}

/** The obstacles a question's shape could honestly become. */
function shapesFor(source: AdventureSource): CheckpointKind[] {
  if (source.typeKey === 'word_ordering') return ['bridge'];
  if (source.typeKey === 'true_false') return ['signpost'];

  const count = optionCount(source);
  // Two ways on is a fork in the road; more than two is a lock to open or a
  // thing to pick up, because a road does not branch four ways.
  if (count === 2) return ['path', 'gate'];
  if (count > 2) return ['gate', 'backpack'];
  return [];
}

/**
 * Builds one journey.
 *
 * Questions the teacher tied to a grammar page come first, because she has
 * said in the data that those are the grammar ones; the rest follow to make
 * up the length. Within each group the order is the round's seed, so a second
 * go is a different walk through the same world.
 *
 * Obstacles are then dealt out so that no two neighbours are the same kind
 * where the questions allow it — a road of six identical gates is a quiz with
 * scenery, and this is trying not to be one.
 */
export function planAdventure(
  sources: AdventureSource[],
  seed: string,
  eligibleTypes: readonly string[] = DEFAULT_ELIGIBLE_TYPES,
): AdventurePlan {
  const rng: Rng = createRng(seed);

  const usable = sources.filter((s) => isEligible(s, eligibleTypes) && shapesFor(s).length > 0);

  const grammarFirst = shuffle(usable.filter((s) => s.fromGrammarSection), rng);
  const rest = shuffle(usable.filter((s) => !s.fromGrammarSection), rng);

  const chosen = [...grammarFirst, ...rest].slice(0, MAXIMUM_CHECKPOINTS);

  const checkpoints: Checkpoint[] = chosen.map((source) => ({
    questionId: source.id,
    kind: shapesFor(source)[0],
    typeKey: source.typeKey,
    prompt: source.prompt,
    payload: source.payload,
    hint: source.hint,
  }));

  // Spread the kinds: where a question could be two things, make it the one
  // its neighbour is not.
  for (let at = 1; at < checkpoints.length; at += 1) {
    const shapes = shapesFor(chosen[at]);
    if (shapes.length < 2) continue;
    if (checkpoints[at].kind === checkpoints[at - 1].kind) {
      checkpoints[at].kind = shapes.find((k) => k !== checkpoints[at - 1].kind) ?? shapes[0];
    }
  }

  // The last stop is the destination's own challenge, whatever it asks.
  if (checkpoints.length > 0) {
    checkpoints[checkpoints.length - 1].kind = 'final';
  }

  return { checkpoints };
}
