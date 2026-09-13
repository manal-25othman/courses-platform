import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ContentStatus, QuestionPurpose } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../auth/auth.types';
import { QuestionEngineService } from '../questions/question-engine.service';
import { SettingsService } from '../settings/settings.service';
import { SETTING_KEYS } from '../settings/settings.types';
import { createRng, shuffle } from '../questions/question.types';
import {
  AdventureSource,
  DEFAULT_ELIGIBLE_TYPES,
  MINIMUM_CHECKPOINTS,
  isEligible,
  planAdventure,
} from './grammar-adventure';
import { AdventureAnswer, AdventureRound, BonusGame, BonusGameRound } from './learning.types';

/**
 * Bonus review games.
 *
 * These are for practice and enjoyment and count for nothing (SRS 13.1,
 * client 2026-08-31): no attempt is recorded, no progress moves, no assessment
 * try is spent, no score changes. That is not a promise made in a comment —
 * this service has no write path at all. It reads published content and
 * returns a round; there is nothing here that could record anything even by
 * mistake.
 *
 * Rounds are built from what the teacher has already published — the unit's
 * vocabulary for the matching games, its grammar questions for Grammar
 * Adventure. Nothing is invented: a wrong answer offered in Quick Match is
 * always another real meaning from the same unit, and every challenge in the
 * adventure is a question a teacher wrote and approved.
 *
 * Which games exist is a registry table, so a new one is a row plus a view,
 * not a change to how games are listed.
 */
@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    /** The one engine. Games present and mark through it, never around it. */
    private readonly engine: QuestionEngineService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Which stored question kinds Grammar Adventure may use.
   *
   * A setting, because whether a kind carries grammar is a curriculum's
   * business: a school whose multiple-choice questions are all grammar can
   * say so without a release.
   */
  private async eligibleTypes(): Promise<readonly string[]> {
    const configured = await this.settings
      .resolve<string[]>(SETTING_KEYS.GAMES_ADVENTURE_TYPES)
      .catch(() => undefined);
    return Array.isArray(configured) && configured.length > 0
      ? configured
      : DEFAULT_ELIGIBLE_TYPES;
  }

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

      const [types, pairs, grammar] = await Promise.all([
        tx.bonusGameType.findMany({ where: { isActive: true }, orderBy: { orderIndex: 'asc' } }),
        this.pairsFor(tx, unitId),
        this.adventureSources(tx, unitId),
      ]);

      // Each game counts the pool its registry row names, so "not enough yet"
      // is measured against the content that game actually reads.
      return types.map((type) => {
        const held = type.contentPool === 'grammar_questions' ? grammar.length : pairs.length;
        return {
          key: type.key,
          displayName: type.displayName,
          description: type.description,
          available: held >= type.minimumItems,
          itemCount: held,
          minimumItems: type.minimumItems,
        };
      });
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

  /**
   * The questions a journey could be built from.
   *
   * Practice questions the teacher has published and is not still checking.
   * The assessment pool is deliberately untouched: a game must never spend or
   * spoil the questions a unit's test draws on.
   *
   * Every one is put through the engine's own `present`, which is what strips
   * the answer key. Nothing in a round has ever held an answer.
   */
  private async adventureSources(
    tx: Parameters<Parameters<PrismaService['forSchool']>[1]>[0],
    unitId: string,
  ): Promise<AdventureSource[]> {
    const rows = await tx.question.findMany({
      where: {
        unitId,
        purpose: QuestionPurpose.ACTIVITY,
        status: ContentStatus.PUBLISHED,
        needsReview: false,
      },
      orderBy: { orderIndex: 'asc' },
      include: { section: { select: { type: { select: { progressComponent: true } } } } },
    });

    const eligible = await this.eligibleTypes();
    const presented: AdventureSource[] = [];

    for (const row of rows) {
      // A kind with no handler is a question the engine cannot present; it is
      // skipped rather than allowed to break a round.
      let payload: Record<string, unknown>;
      try {
        payload = this.engine
          .handlerFor(row.typeKey)
          .present(
            { id: row.id, prompt: row.prompt, payload: row.payload, points: row.points },
            { shuffleOptions: false, rng: createRng(row.id) },
          ).payload;
      } catch {
        continue;
      }

      const source: AdventureSource = {
        id: row.id,
        typeKey: row.typeKey,
        prompt: row.prompt,
        payload,
        fromGrammarSection: row.section?.type?.progressComponent === 'grammar',
        // The teacher's own nudge, read from the question's payload. The
        // payload is free-form per kind, which is where a hint belongs: it is
        // part of how a question is asked, not a new fact about every question
        // ever stored.
        hint:
          typeof (row.payload as { hint?: unknown } | null)?.hint === 'string'
            ? ((row.payload as { hint: string }).hint.trim() || null)
            : null,
      };

      if (isEligible(source, eligible)) presented.push(source);
    }

    return presented;
  }

  /**
   * One journey through this unit's world.
   *
   * The unit decides the scenery and the teacher's questions decide the
   * obstacles; this puts the two together. Seeded from the moment it is
   * asked for, so starting again is a different walk.
   */
  async adventureRound(actor: CurrentUser, unitId: string): Promise<AdventureRound> {
    return this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const unit = await tx.unit.findFirst({
        where: { id: unitId, status: ContentStatus.PUBLISHED },
        select: { id: true, title: true },
      });
      if (!unit) throw new NotFoundException('Unit not found.');

      const type = await tx.bonusGameType.findFirst({
        where: { key: 'grammar_adventure', isActive: true },
      });
      if (!type) throw new NotFoundException('That game is not available.');

      const sources = await this.adventureSources(tx, unitId);
      if (sources.length < Math.max(type.minimumItems, MINIMUM_CHECKPOINTS)) {
        throw new NotFoundException(
          'This unit does not have enough grammar questions for an adventure yet.',
        );
      }

      const { checkpoints } = planAdventure(
        sources,
        `adventure:${unitId}:${actor.userId}:${Date.now()}`,
        await this.eligibleTypes(),
      );

      return { gameKey: 'grammar_adventure', unitId, unitTitle: unit.title, checkpoints };
    });
  }

  /**
   * Is this the way on?
   *
   * Marked by the engine that marks everything else, so the game cannot drift
   * from the activity about what a right answer is. Nothing is written: a
   * wrong turn costs nothing but a moment, which is the whole point of a
   * game for an eleven-year-old.
   *
   * The answer key never leaves the server. What comes back is whether the
   * road opens, and — only when it does not — the hint the teacher wrote.
   */
  async checkAdventureAnswer(
    actor: CurrentUser,
    unitId: string,
    questionId: string,
    response: unknown,
  ): Promise<AdventureAnswer> {
    return this.prisma.forSchool(this.schoolOf(actor), async (tx) => {
      const unit = await tx.unit.findFirst({
        where: { id: unitId, status: ContentStatus.PUBLISHED },
        select: { id: true },
      });
      if (!unit) throw new NotFoundException('Unit not found.');

      // The question must be one this unit could actually have asked her:
      // same unit, published, not held back, practice rather than test.
      const question = await tx.question.findFirst({
        where: {
          id: questionId,
          unitId,
          purpose: QuestionPurpose.ACTIVITY,
          status: ContentStatus.PUBLISHED,
          needsReview: false,
        },
      });
      if (!question) throw new NotFoundException('That challenge is not part of this unit.');

      let result;
      try {
        result = this.engine
          .handlerFor(question.typeKey)
          .grade(question.payload, question.answerKey, response, question.points);
      } catch {
        throw new BadRequestException('That answer could not be read.');
      }

      const hint =
        typeof (question.payload as { hint?: unknown } | null)?.hint === 'string'
          ? ((question.payload as { hint: string }).hint.trim() || null)
          : null;

      return {
        questionId,
        correct: result.isCorrect === true,
        // Only on a wrong turn, and only what the teacher wrote. Nothing here
        // explains grammar on its own.
        hint: result.isCorrect === true ? null : hint,
      };
    });
  }
}
