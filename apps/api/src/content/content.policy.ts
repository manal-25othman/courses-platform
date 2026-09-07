import { ForbiddenException } from '@nestjs/common';
import { ContentStatus, UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/auth.types';

/**
 * Who may do what to curriculum. One place, so the rule reads the same for a
 * word, a grammar page, a question and a unit.
 *
 *   TEACHER  — owns the academic content: writes it, reviews it, publishes it,
 *              hides it.
 *   ADMIN    — the school's administrator may help prepare it: create and edit
 *              drafts. She can never publish, never hide, and never change a
 *              thing students can already see, so nothing she saves reaches a
 *              student by accident.
 *   STUDENT  — reads published content only (enforced elsewhere).
 *   PLATFORM_ADMIN — has no school and no curriculum routes at all.
 *
 * These are enforced here, in the API, not in the screens: a screen that hid
 * a button would stop a person, not a request.
 */
export function canPublish(actor: Pick<CurrentUser, 'role'>): boolean {
  return actor.role === UserRole.TEACHER;
}

/** Publishing and hiding are a teacher's decision. */
export function assertMayPublish(actor: Pick<CurrentUser, 'role'>): void {
  if (!canPublish(actor)) {
    throw new ForbiddenException(
      'Only a teacher can publish or hide curriculum. Your changes are saved as drafts for a teacher to review.',
    );
  }
}

/**
 * Changing or removing something: a teacher always may; an administrator
 * only while it is still a draft. Once students can see an item, altering
 * or deleting it changes what they see, and that is the teacher's call.
 */
export function assertMayChange(
  actor: Pick<CurrentUser, 'role'>,
  item: { status: ContentStatus },
  what = 'This item',
): void {
  if (actor.role === UserRole.TEACHER) return;
  if (actor.role === UserRole.ADMIN && item.status === ContentStatus.DRAFT) return;
  throw new ForbiddenException(
    `${what} is published, so students may be using it. Only a teacher can change or remove it. Ask a teacher to hide it first if it needs work.`,
  );
}
