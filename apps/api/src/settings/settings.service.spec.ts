import { describe, expect, it, beforeEach } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { SettingScope } from '@prisma/client';
import { SettingsService } from './settings.service';
import { SETTING_KEYS } from './settings.types';
import type { PrismaService } from '../prisma/prisma.service';

/** A row as the database would return it. */
interface Row {
  id: string;
  scope: SettingScope;
  scopeId: string | null;
  key: string;
  value: unknown;
}

/**
 * A stand-in for the database.
 *
 * These tests are about the resolution *order* — which scope wins — so they run
 * against an in-memory store rather than a real database. That keeps them fast
 * and keeps CI from needing a PostgreSQL service.
 */
function fakePrisma(rows: Row[]) {
  let nextId = rows.length;

  return {
    setting: {
      findMany: async ({ where }: { where: { key: string; OR: Array<{ scope: SettingScope; scopeId: string | null }> } }) =>
        rows.filter(
          (row) =>
            row.key === where.key &&
            where.OR.some((c) => c.scope === row.scope && c.scopeId === row.scopeId),
        ),

      findFirst: async ({ where }: { where: { key: string; scope: SettingScope; scopeId: string | null } }) =>
        rows.find(
          (row) =>
            row.key === where.key && row.scope === where.scope && row.scopeId === where.scopeId,
        ) ?? null,

      create: async ({ data }: { data: Omit<Row, 'id'> }) => {
        const row: Row = { id: String(++nextId), ...data };
        rows.push(row);
        return row;
      },

      update: async ({ where, data }: { where: { id: string }; data: { value: unknown } }) => {
        const row = rows.find((r) => r.id === where.id)!;
        row.value = data.value;
        return row;
      },
    },
  } as unknown as PrismaService;
}

const SCHOOL = 'school-1';
const ASSESSMENT = 'assessment-1';
const KEY = SETTING_KEYS.ASSESSMENT_PASSING_SCORE;

describe('SettingsService', () => {
  let rows: Row[];
  let service: SettingsService;

  beforeEach(() => {
    rows = [
      { id: '1', scope: SettingScope.GLOBAL, scopeId: null, key: KEY, value: 80 },
      {
        id: '2',
        scope: SettingScope.GLOBAL,
        scopeId: null,
        key: SETTING_KEYS.ASSESSMENT_RESULT_POLICY,
        value: 'highest',
      },
    ];
    service = new SettingsService(fakePrisma(rows));
  });

  describe('resolve', () => {
    it('returns the global value when no narrower scope is given', async () => {
      // The 80% passing score from SRS 17 — read from data, never a constant.
      await expect(service.resolve(KEY)).resolves.toBe(80);
    });

    it('prefers a school value over the global one', async () => {
      rows.push({ id: '3', scope: SettingScope.SCHOOL, scopeId: SCHOOL, key: KEY, value: 70 });

      await expect(
        service.resolve(KEY, [{ scope: SettingScope.SCHOOL, scopeId: SCHOOL }]),
      ).resolves.toBe(70);
    });

    it('leaves the global value untouched when a school overrides it', async () => {
      rows.push({ id: '3', scope: SettingScope.SCHOOL, scopeId: SCHOOL, key: KEY, value: 70 });

      await expect(service.resolve(KEY)).resolves.toBe(80);
    });

    it('prefers the most specific scope when several match', async () => {
      rows.push(
        { id: '3', scope: SettingScope.SCHOOL, scopeId: SCHOOL, key: KEY, value: 70 },
        { id: '4', scope: SettingScope.ASSESSMENT, scopeId: ASSESSMENT, key: KEY, value: 90 },
      );

      await expect(
        service.resolve(KEY, [
          { scope: SettingScope.ASSESSMENT, scopeId: ASSESSMENT },
          { scope: SettingScope.SCHOOL, scopeId: SCHOOL },
        ]),
      ).resolves.toBe(90);
    });

    it('falls through the whole chain to the global value', async () => {
      await expect(
        service.resolve(SETTING_KEYS.ASSESSMENT_RESULT_POLICY, [
          { scope: SettingScope.ASSESSMENT, scopeId: ASSESSMENT },
          { scope: SettingScope.SCHOOL, scopeId: SCHOOL },
        ]),
      ).resolves.toBe('highest');
    });

    it('returns undefined for a key that is not set anywhere', async () => {
      await expect(service.resolve('nothing.here' as never)).resolves.toBeUndefined();
    });

    it('ignores a value belonging to a different school', async () => {
      rows.push({ id: '3', scope: SettingScope.SCHOOL, scopeId: 'other-school', key: KEY, value: 55 });

      await expect(
        service.resolve(KEY, [{ scope: SettingScope.SCHOOL, scopeId: SCHOOL }]),
      ).resolves.toBe(80);
    });
  });

  describe('require', () => {
    it('returns the value when the key exists', async () => {
      await expect(service.require(KEY)).resolves.toBe(80);
    });

    it('throws rather than inventing a default', async () => {
      await expect(service.require('nothing.here' as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('set', () => {
    it('creates a value that does not exist yet', async () => {
      await service.set(KEY, 65, SettingScope.SCHOOL, SCHOOL);

      await expect(
        service.resolve(KEY, [{ scope: SettingScope.SCHOOL, scopeId: SCHOOL }]),
      ).resolves.toBe(65);
    });

    it('replaces an existing value instead of adding a duplicate', async () => {
      await service.set(KEY, 65, SettingScope.SCHOOL, SCHOOL);
      await service.set(KEY, 75, SettingScope.SCHOOL, SCHOOL);

      const matching = rows.filter((r) => r.scope === SettingScope.SCHOOL && r.key === KEY);
      expect(matching).toHaveLength(1);
      expect(matching[0].value).toBe(75);
    });
  });
});
