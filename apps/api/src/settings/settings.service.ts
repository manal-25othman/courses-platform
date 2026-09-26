import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SettingScope } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { cachedSetting, forgetCachedSettings } from './settings-cache';
import { SettingKey, SettingScopeRef } from './settings.types';

/**
 * Reads configuration values from the database.
 *
 * Rules the SRS requires to stay changeable — the 80% passing score, the
 * 2-attempt limit, progress weights, the highest-score policy, randomization
 * flags, whether games count — are stored as data and read through here.
 * Nothing that a client may later want to change belongs in a constant
 * (SRS 17, 19, 21, 45, 58).
 */
@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves a value by walking `scopes` from most specific to least specific,
   * then falling back to the global value.
   *
   * @returns the first value found, or `undefined` if the key is not set anywhere.
   */
  async resolve<T = unknown>(
    key: SettingKey,
    scopes: SettingScopeRef[] = [],
  ): Promise<T | undefined> {
    const chain: SettingScopeRef[] = [...scopes, { scope: SettingScope.GLOBAL, scopeId: null }];

    // The chain, not just the key, identifies the question: the same key
    // answered against a different unit or school is a different answer, and
    // caching them together would hand one scope's value to another. Within
    // one request the same question has the same answer, and asking it forty
    // times -- which a unit list does -- is forty round trips for one fact.
    const question = `${key}|${chain.map(({ scope, scopeId }) => `${scope}:${scopeId ?? ''}`).join('>')}`;

    return cachedSetting(question, async () => {
      // One query for every candidate scope, then pick by the chain's order.
      const rows = await this.prisma.setting.findMany({
        where: {
          key,
          OR: chain.map(({ scope, scopeId }) => ({ scope, scopeId })),
        },
      });

      if (rows.length === 0) {
        return undefined;
      }

      for (const { scope, scopeId } of chain) {
        const match = rows.find((row) => row.scope === scope && row.scopeId === scopeId);
        if (match) {
          return match.value as T;
        }
      }

      return undefined;
    });
  }

  /**
   * Same as {@link resolve}, but throws when the key is missing.
   *
   * Use this for values the system cannot sensibly run without, so a missing
   * setting fails loudly at the point of use instead of silently becoming a
   * hidden default somewhere in the code.
   */
  async require<T = unknown>(key: SettingKey, scopes: SettingScopeRef[] = []): Promise<T> {
    const value = await this.resolve<T>(key, scopes);

    if (value === undefined) {
      throw new NotFoundException(`Configuration value "${key}" is not set.`);
    }

    return value;
  }

  /** Creates or replaces a value at one scope. */
  async set(
    key: SettingKey,
    value: Prisma.InputJsonValue,
    scope: SettingScope = SettingScope.GLOBAL,
    scopeId: string | null = null,
    updatedBy: string | null = null,
  ): Promise<void> {
    // A request that changes a value and then reads it must see what it wrote,
    // so the cache this request built is dropped here.
    forgetCachedSettings();

    const existing = await this.prisma.setting.findFirst({ where: { key, scope, scopeId } });

    if (existing) {
      await this.prisma.setting.update({
        where: { id: existing.id },
        data: { value, updatedBy },
      });
      return;
    }

    await this.prisma.setting.create({
      data: { key, value, scope, scopeId, updatedBy },
    });
  }
}
