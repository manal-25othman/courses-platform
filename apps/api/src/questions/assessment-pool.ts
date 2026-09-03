import { ContentStatus, QuestionPurpose } from '@prisma/client';

/**
 * Which questions a unit's test draws from.
 *
 * Two rules, and they are easy to get subtly wrong in two places:
 *
 *   A question is asked only once it is published AND nobody has flagged it
 *   for review. A flagged question is one a person still has to look at, and
 *   an unreviewed question is not something to set a child a test on.
 *
 *   A unit with test questions of its own uses them. A unit with none falls
 *   back to its practice questions, so that a teacher who has written an
 *   activity but not yet a test still has a test that works.
 *
 * Kept here, in one place, because the learning service applies it when a
 * student sits the test and the questions service applies it when a teacher
 * previews one. Those two answering differently is the whole bug this avoids:
 * a preview that shows nothing while the real test asks twenty-one questions
 * is worse than no preview at all.
 */

/** Published, and not waiting on anybody. */
export const SETTLED = {
  status: ContentStatus.PUBLISHED,
  needsReview: false,
} as const;

export interface Pool {
  where: { unitId: string; purpose: QuestionPurpose; status: ContentStatus; needsReview: boolean };
  /** True when the unit has test questions of its own. */
  curated: boolean;
}

/** Counts what is there, then says where the test will draw from. */
export async function assessmentPool(
  tx: { question: { count(args: { where: Record<string, unknown> }): Promise<number> } },
  unitId: string,
): Promise<Pool> {
  const curated = await tx.question.count({
    where: { unitId, purpose: QuestionPurpose.ASSESSMENT, ...SETTLED },
  });

  return curated > 0
    ? { where: { unitId, purpose: QuestionPurpose.ASSESSMENT, ...SETTLED }, curated: true }
    : { where: { unitId, purpose: QuestionPurpose.ACTIVITY, ...SETTLED }, curated: false };
}
