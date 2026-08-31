import { Injectable, NotFoundException } from '@nestjs/common';
import { ContentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../auth/auth.types';
import { createRng, shuffle } from '../questions/question.types';
import { BonusGame, BonusGameRound } from './learning.types';

/**
 * Bonus review games.
 *
 * These are for practice and enjoyment and count for nothing (SRS 13.1,
 * client 2026-08-31): no attempt is recorded, no progress moves, no assessment
 * try is spent, no score changes. That is not a promise made in a comment —
 * this service has no write path at all. It reads vocabulary and returns a
 * round; there is nothing here that could record anything even by mistake.
 *
 * Rounds are built from vocabulary the teacher has already published. Nothing
 * is invented: a wrong answer offered in Quick Match is always another real
 * meaning from the same unit, never a word this made up.
 *
 * Which games exist is a registry table, so a new one is a row plus a view,
 * not a change to how games are listed.
 */
@Injectable()
export class GamesService {
  constructor(private readonly prisma: PrismaService) {}

  private schoolOf(actor: CurrentUser): string {
    if (!actor.schoolId) throw new NotFoundException('Your account is not attached to a school.');
    return actor.schoolId;
  }

  /** Only words a student can actually see, and only complete pairs. */
  private async pairsFor(tx: Parameters<Parameters<PrismaService['forSchool']>[1]>[0], unitId: string) {
    const words = await tx.vocabularyItem.findMany({
      where: { unitId, status: ContentStatus.PUBLISHED },
      select: { id: true, wordEn: true, meaningAr: true },
      orderBy: { orderIndex: 'asc' },
    });

    // A word with no meaning cannot be paired with anything, so it is left out
    // rather than shown against a blank card.
    return words.filter(
      (w): w is { id: string; wordEn: string; meaningAr: string } =>
        typeof w.meaningAr === 'string' && w.meaningAr.trim() !== '',
    );
  }

  /**
   * The games this unit has enough content for.
   *
   * A game with too little to draw on is listed as unavailable and says why,
   * rather than disappearing — otherwise a teacher cannot tell whether the
   * game is off or the words are missing.
   */
  async listForUnit(actor: CurrentUser, unitId: string): Promise<BonusGame[]> {
    return this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const unit = await tx.unit.findFirst({
        where: { id: unitId, status: ContentStatus.PUBLISHED },
        select: { id: true },
      });
      if (!unit) throw new NotFoundException('Unit not found.');

      const [types, pairs] = await Promise.all([
        tx.bonusGameType.findMany({ where: { isActive: true }, orderBy: { orderIndex: 'asc' } }),
        this.pairsFor(tx, unitId),
      ]);

      return types.map((type) => ({
        key: type.key,
        displayName: type.displayName,
        description: type.description,
        available: pairs.length >= type.minimumItems,
        itemCount: pairs.length,
        minimumItems: type.minimumItems,
      }));
    });
  }

  /**
   * One round to play.
   *
   * Seeded per request, so every round is a fresh order — there is nothing to
   * resume and nothing kept, which is exactly what a game that counts for
   * nothing should do.
   */
  async round(actor: CurrentUser, unitId: string, gameKey: string): Promise<BonusGameRound> {
    return this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const unit = await tx.unit.findFirst({
        where: { id: unitId, status: ContentStatus.PUBLISHED },
        select: { id: true },
      });
      if (!unit) throw new NotFoundException('Unit not found.');

      const type = await tx.bonusGameType.findFirst({ where: { key: gameKey, isActive: true } });
      if (!type) throw new NotFoundException('That game is not available.');

      const pairs = await this.pairsFor(tx, unitId);
      if (pairs.length < type.minimumItems) {
        throw new NotFoundException('This unit does not have enough words for that game yet.');
      }

      const rng = createRng(`${gameKey}:${unitId}:${actor.userId}:${Date.now()}`);

      if (gameKey === 'memory_match') {
        // A board of eight pairs at most: sixteen cards is already a lot to
        // hold on a phone screen.
        const chosen = shuffle(pairs, rng).slice(0, Math.min(8, pairs.length));
        return { gameKey, unitId, pairs: chosen, questions: [] };
      }

      // Quick Match: a word, its real meaning, and three other real meanings
      // from the same unit. Nothing is invented to fill the options.
      const chosen = shuffle(pairs, rng).slice(0, Math.min(10, pairs.length));
      const questions = chosen.map((pair) => {
        // Two different words can share a meaning. Offering the right answer
        // twice makes the question unanswerable, and offering the same wrong
        // answer twice just wastes a slot — so the pool is made unique before
        // three are taken from it, not merely filtered against the answer.
        const distinct = [
          ...new Set(
            pairs.filter((p) => p.id !== pair.id).map((p) => p.meaningAr),
          ),
        ].filter((meaning) => meaning !== pair.meaningAr);

        const others = shuffle(distinct, rng).slice(0, 3);

        return {
          wordEn: pair.wordEn,
          answer: pair.meaningAr,
          options: shuffle([pair.meaningAr, ...others], rng),
        };
      });

      return { gameKey, unitId, pairs: [], questions };
    });
  }
}
