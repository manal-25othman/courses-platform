import { describe, expect, it, vi } from 'vitest';
import { SettingScope } from '@prisma/client';
import { SettingsService } from './settings.service';
import { forgetCachedSettings, withSettingsCache } from './settings-cache';
import type { SettingKey } from './settings.types';
import type { PrismaService } from '../prisma/prisma.service';

const PASSING = 'assessment.passingScore' as SettingKey;
const WEIGHTS = 'progress.weights' as SettingKey;

/** A database that counts how many times it was asked. */
function database(rows: { key: string; scope: SettingScope; scopeId: string | null; value: unknown }[]) {
  const findMany = vi.fn(async ({ where }: { where: { key: string; OR: { scope: SettingScope; scopeId: string | null }[] } }) =>
    rows.filter(
      (row) =>
        row.key === where.key &&
        where.OR.some((want) => want.scope === row.scope && want.scopeId === row.scopeId),
    ),
  );

  const prisma = { setting: { findMany, findFirst: vi.fn(), update: vi.fn(), create: vi.fn() } };
  return { prisma: prisma as unknown as PrismaService, findMany, raw: prisma };
}

describe('resolving a setting inside one request', () => {
  it('asks the database once, however many times the request asks', async () => {
    const { prisma, findMany } = database([
      { key: PASSING, scope: SettingScope.GLOBAL, scopeId: null, value: 80 },
    ]);
    const settings = new SettingsService(prisma);

    const answers = await withSettingsCache(async () =>
      Promise.all([
        settings.resolve<number>(PASSING),
        settings.resolve<number>(PASSING),
        settings.resolve<number>(PASSING),
      ]),
    );

    expect(answers).toEqual([80, 80, 80]);
    // Once, not three times — and once even though all three asked at the
    // same moment, which is what a unit list does.
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('keeps two scopes apart, so one unit cannot answer for another', async () => {
    const { prisma, findMany } = database([
      { key: PASSING, scope: SettingScope.GLOBAL, scopeId: null, value: 80 },
      { key: PASSING, scope: SettingScope.UNIT, scopeId: 'unit-2', value: 60 },
    ]);
    const settings = new SettingsService(prisma);

    const [globalValue, unitOne, unitTwo] = await withSettingsCache(async () => [
      await settings.resolve<number>(PASSING),
      await settings.resolve<number>(PASSING, [{ scope: SettingScope.UNIT, scopeId: 'unit-1' }]),
      await settings.resolve<number>(PASSING, [{ scope: SettingScope.UNIT, scopeId: 'unit-2' }]),
    ]);

    expect(globalValue).toBe(80);
    expect(unitOne).toBe(80); // falls through to the global value
    expect(unitTwo).toBe(60); // its own value wins
    expect(findMany).toHaveBeenCalledTimes(3);
  });

  it('keeps the precedence the chain describes', async () => {
    const { prisma } = database([
      { key: PASSING, scope: SettingScope.GLOBAL, scopeId: null, value: 80 },
      { key: PASSING, scope: SettingScope.SCHOOL, scopeId: 'school-1', value: 70 },
      { key: PASSING, scope: SettingScope.UNIT, scopeId: 'unit-1', value: 60 },
    ]);
    const settings = new SettingsService(prisma);

    const value = await withSettingsCache(() =>
      settings.resolve<number>(PASSING, [
        { scope: SettingScope.UNIT, scopeId: 'unit-1' },
        { scope: SettingScope.SCHOOL, scopeId: 'school-1' },
      ]),
    );

    expect(value).toBe(60);
  });

  it('caches each key separately', async () => {
    const { prisma, findMany } = database([
      { key: PASSING, scope: SettingScope.GLOBAL, scopeId: null, value: 80 },
      { key: WEIGHTS, scope: SettingScope.GLOBAL, scopeId: null, value: { words: 1 } },
    ]);
    const settings = new SettingsService(prisma);

    await withSettingsCache(async () => {
      await settings.resolve(PASSING);
      await settings.resolve(WEIGHTS);
      await settings.resolve(PASSING);
    });

    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('remembers a value that is not set, rather than asking again', async () => {
    const { prisma, findMany } = database([]);
    const settings = new SettingsService(prisma);

    const answers = await withSettingsCache(async () => [
      await settings.resolve(PASSING),
      await settings.resolve(PASSING),
    ]);

    expect(answers).toEqual([undefined, undefined]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });
});

describe('the cache ends with the request', () => {
  it('does not carry an answer from one request into the next', async () => {
    const { prisma, findMany } = database([
      { key: PASSING, scope: SettingScope.GLOBAL, scopeId: null, value: 80 },
    ]);
    const settings = new SettingsService(prisma);

    await withSettingsCache(() => settings.resolve(PASSING));
    await withSettingsCache(() => settings.resolve(PASSING));

    // Twice: a value changed in the CMS is seen by the very next request.
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('reads the database when there is no request at all', async () => {
    const { prisma, findMany } = database([
      { key: PASSING, scope: SettingScope.GLOBAL, scopeId: null, value: 80 },
    ]);
    const settings = new SettingsService(prisma);

    expect(await settings.resolve(PASSING)).toBe(80);
    expect(await settings.resolve(PASSING)).toBe(80);
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('forgets what it knew once a value is written', async () => {
    const { prisma, findMany } = database([
      { key: PASSING, scope: SettingScope.GLOBAL, scopeId: null, value: 80 },
    ]);
    const settings = new SettingsService(prisma);

    await withSettingsCache(async () => {
      await settings.resolve(PASSING);
      forgetCachedSettings();
      await settings.resolve(PASSING);
    });

    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it('does not remember a failed read', async () => {
    const findMany = vi
      .fn()
      .mockRejectedValueOnce(new Error('the database was unreachable'))
      .mockResolvedValueOnce([
        { key: PASSING, scope: SettingScope.GLOBAL, scopeId: null, value: 80 },
      ]);
    const settings = new SettingsService({ setting: { findMany } } as unknown as PrismaService);

    await withSettingsCache(async () => {
      await expect(settings.resolve(PASSING)).rejects.toThrow('unreachable');
      expect(await settings.resolve(PASSING)).toBe(80);
    });

    expect(findMany).toHaveBeenCalledTimes(2);
  });
});
