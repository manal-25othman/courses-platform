import { describe, expect, it, vi } from 'vitest';
import { ContentStatus, QuestionPurpose, UserRole } from '@prisma/client';
import { QuestionsService } from './questions.service';
import type { QuestionEngineService } from './question-engine.service';
import type { AuditService } from '../audit/audit.service';
import type { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../auth/auth.types';

const SCHOOL = 'school-1';
const teacher: CurrentUser = {
  sub: 't1', userId: 't1', role: UserRole.TEACHER, schoolId: SCHOOL, mustChangePassword: false,
};
const admin: CurrentUser = { ...teacher, sub: 'a1', userId: 'a1', role: UserRole.ADMIN };

/**
 * The same lifecycle rules a word follows, on a question — plus the one a
 * question has always had: nothing the import could not read is published.
 */
describe('QuestionsService lifecycle by role', () => {
  function harness(
    questions: {
      id: string; unitId: string; status: ContentStatus; needsReview: boolean;
      typeKey: string; payload: unknown; answerKey: unknown; purpose: QuestionPurpose;
    }[],
  ) {
    const updates: Record<string, unknown>[] = [];
    const tx = {
      unit: { findUnique: async () => ({ id: 'u1' }) },
      question: {
        findUnique: async (args: { where: { id: string } }) =>
          questions.find((q) => q.id === args.where.id) ?? null,
        findFirst: async () => null,
        create: async (args: { data: Record<string, unknown> }) => ({ id: 'new', ...args.data }),
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push(args.data);
          return { ...questions.find((q) => q.id === args.where.id), ...args.data };
        },
        delete: async () => ({}),
      },
    };
    const prisma = {
      forSchool: async <T>(_schoolId: string, work: (t: typeof tx) => Promise<T>) => work(tx),
    } as unknown as PrismaService;
    const engine = { assertValid: vi.fn() } as unknown as QuestionEngineService;
    const audit = { record: vi.fn() } as unknown as AuditService;
    return { service: new QuestionsService(prisma, engine, audit), updates };
  }

  const base = { unitId: 'u1', typeKey: 'mcq', payload: {}, answerKey: {}, purpose: QuestionPurpose.ACTIVITY };
  const draft = { ...base, id: 'q-draft', status: ContentStatus.DRAFT, needsReview: false };
  const live = { ...base, id: 'q-live', status: ContentStatus.PUBLISHED, needsReview: false };
  const unread = { ...base, id: 'q-unread', status: ContentStatus.DRAFT, needsReview: true };

  it('saves a new question from the administrator as a draft', async () => {
    const { service } = harness([]);
    const created = await service.create(admin, 'u1', {
      typeKey: 'mcq', prompt: 'Pick one', payload: {}, answerKey: {},
    } as never);
    expect((created as { status: ContentStatus }).status).toBe(ContentStatus.DRAFT);
  });

  it('lets the administrator edit a draft but never a published question', async () => {
    const { service } = harness([draft, live]);
    await expect(service.update(admin, 'q-draft', { prompt: 'Better wording' })).resolves.toBeTruthy();
    await expect(service.update(admin, 'q-live', { prompt: 'Changed' })).rejects.toThrow(/only a teacher/i);
    await expect(service.remove(admin, 'q-live')).rejects.toThrow(/only a teacher/i);
  });

  it('refuses to let the administrator publish or hide', async () => {
    const { service, updates } = harness([draft, live]);
    await expect(service.setStatus(admin, 'q-draft', ContentStatus.PUBLISHED)).rejects.toThrow(/only a teacher/i);
    await expect(service.setStatus(admin, 'q-live', ContentStatus.DRAFT)).rejects.toThrow(/only a teacher/i);
    expect(updates).toHaveLength(0);
  });

  it('lets the teacher publish a checked question and hide it again', async () => {
    const { service, updates } = harness([draft, live]);
    await service.setStatus(teacher, 'q-draft', ContentStatus.PUBLISHED);
    await service.setStatus(teacher, 'q-live', ContentStatus.DRAFT);
    expect(updates).toEqual([{ status: ContentStatus.PUBLISHED }, { status: ContentStatus.DRAFT }]);
  });

  it('never publishes a question whose answer was not read from the file', async () => {
    const { service, updates } = harness([unread]);
    await expect(service.setStatus(teacher, 'q-unread', ContentStatus.PUBLISHED)).rejects.toThrow(/needs checking/i);
    expect(updates).toHaveLength(0);
  });
});
