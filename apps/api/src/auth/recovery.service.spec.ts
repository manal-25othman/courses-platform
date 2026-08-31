import { describe, expect, it } from 'vitest';
import { UserRole, UserStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { RecoveryService } from './recovery.service';
import { PasswordService } from './password.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { TokenService } from '../auth/token.service';
import type { EmailService } from '../email/email.service';
import type { AuditService } from '../audit/audit.service';
import type { ConfigService } from '@nestjs/config';

/**
 * Recovery has to be careful about two different things at once, and they pull
 * in opposite directions: a person who has genuinely forgotten her password
 * must get back in, and a stranger typing addresses must learn nothing.
 *
 * These hold both lines.
 */

const SCHOOL = 'school-1';

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    schoolId: SCHOOL,
    role: UserRole.TEACHER,
    username: 'teacher-one',
    email: 'teacher@example.com',
    passwordHash: 'old-hash',
    mustChangePassword: false,
    status: UserStatus.ACTIVE,
    deletedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

interface Harness {
  service: RecoveryService;
  sent: { to: string; subject: string; text: string }[];
  created: Record<string, unknown>[];
  userUpdates: Record<string, unknown>[];
  tokenUpdates: Record<string, unknown>[];
  revokedFor: string[];
  spentAll: Record<string, unknown>[];
}

function harness(options: {
  usersByEmail?: ReturnType<typeof userRow>[];
  token?: { id: string; userId: string } | null;
  userById?: ReturnType<typeof userRow> | null;
}): Harness {
  const sent: Harness['sent'] = [];
  const created: Record<string, unknown>[] = [];
  const userUpdates: Record<string, unknown>[] = [];
  const tokenUpdates: Record<string, unknown>[] = [];
  const revokedFor: string[] = [];
  const spentAll: Record<string, unknown>[] = [];

  const tx = {
    user: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        userUpdates.push(data);
        return data;
      },
    },
    passwordResetToken: {
      update: async ({ data }: { data: Record<string, unknown> }) => {
        tokenUpdates.push(data);
        return data;
      },
    },
  };

  const prisma = {
    findUsersByEmail: async () => options.usersByEmail ?? [],
    findResetToken: async () => options.token ?? null,
    findUserForAuthentication: async () => options.userById ?? null,
    passwordResetToken: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: 't1', ...data };
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        tokenUpdates.push(data);
        return data;
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        spentAll.push(data);
        return { count: 1 };
      },
    },
    user: tx.user,
    forSchool: async <T>(_s: string, work: (t: typeof tx) => Promise<T>) => work(tx),
  } as unknown as PrismaService;

  const email = {
    send: async (to: string, subject: string, text: string) => {
      sent.push({ to, subject, text });
      return true;
    },
  } as unknown as EmailService;

  const tokens = {
    revokeAllForUser: async (userId: string) => {
      revokedFor.push(userId);
    },
  } as unknown as TokenService;

  const audit = { record: async () => undefined } as unknown as AuditService;

  const config = {
    get: (key: string) =>
      key === 'WEB_BASE_URL' ? 'https://learn.example.com' : undefined,
  } as unknown as ConfigService;

  return {
    service: new RecoveryService(prisma, new PasswordService(), tokens, email, audit, config),
    sent,
    created,
    userUpdates,
    tokenUpdates,
    revokedFor,
    spentAll,
  };
}

describe('RecoveryService tells a stranger nothing', () => {
  /**
   * The one that matters most. An address that answers differently from one
   * that does not is a way to find out which of a school's teachers has an
   * account — and, given a class list, which children do.
   */
  it('answers an unknown address exactly as it answers a known one', async () => {
    const known = harness({ usersByEmail: [userRow()] });
    const unknown = harness({ usersByEmail: [] });

    await expect(known.service.requestReset('teacher@example.com')).resolves.toBeUndefined();
    await expect(unknown.service.requestReset('nobody@example.com')).resolves.toBeUndefined();
  });

  it('sends nothing at all for an address with no account', async () => {
    const { service, sent, created } = harness({ usersByEmail: [] });

    await service.requestReset('nobody@example.com');

    expect(sent).toHaveLength(0);
    expect(created).toHaveLength(0);
  });

  /** Usernames repeat across schools, and so do addresses. */
  it('sends one link per account when an address has several', async () => {
    const { service, sent } = harness({
      usersByEmail: [userRow(), userRow({ id: 'u2', schoolId: 'school-2' })],
    });

    await service.requestReset('teacher@example.com');

    expect(sent).toHaveLength(2);
  });
});

describe('RecoveryService stores only what it must', () => {
  it('never stores the token itself', async () => {
    const { service, created, sent } = harness({ usersByEmail: [userRow()] });

    await service.requestReset('teacher@example.com');

    const token = /token=([^\s]+)/.exec(sent[0].text)?.[1];
    expect(token).toBeTruthy();

    const stored = created[0] as { tokenHash: string };
    expect(stored.tokenHash).not.toBe(token);
    expect(stored.tokenHash).toBe(createHash('sha256').update(token!).digest('hex'));
  });

  it('gives the link an expiry', async () => {
    const { service, created } = harness({ usersByEmail: [userRow()] });

    await service.requestReset('teacher@example.com');

    const stored = created[0] as { expiresAt: Date };
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('points the link at the website, not at the API', async () => {
    const { service, sent } = harness({ usersByEmail: [userRow()] });

    await service.requestReset('teacher@example.com');

    expect(sent[0].text).toContain('https://learn.example.com/reset-password?token=');
  });
});

describe('RecoveryService redeeming a link', () => {
  const live = { id: 't1', userId: 'u1' };

  it('refuses a token the database does not recognise', async () => {
    const { service } = harness({ token: null });

    await expect(service.completeReset('made-up', 'a-new-password')).rejects.toThrow(
      /expired or has already been used/i,
    );
  });

  /** Expiry and single use are decided in the database, so this covers both. */
  it('refuses a token whose account has been deleted', async () => {
    const { service } = harness({
      token: live,
      userById: userRow({ deletedAt: new Date() }),
    });

    await expect(service.completeReset('anything', 'a-new-password')).rejects.toThrow(
      /expired or has already been used/i,
    );
  });

  it('sets a new password and does not ask her to change it again', async () => {
    const { service, userUpdates } = harness({ token: live, userById: userRow() });

    await service.completeReset('anything', 'a-new-password');

    const update = userUpdates[0] as { passwordHash: string; mustChangePassword: boolean };
    expect(update.passwordHash).toMatch(/^\$argon2id\$/);
    expect(update.mustChangePassword).toBe(false);
  });

  it('spends the token it used', async () => {
    const { service, tokenUpdates } = harness({ token: live, userById: userRow() });

    await service.completeReset('anything', 'a-new-password');

    expect(tokenUpdates.some((u) => 'usedAt' in u)).toBe(true);
  });

  /**
   * Someone resetting a password is often doing it because she thinks the
   * account is no longer only hers, so everything outstanding stops working.
   */
  it('ends every open session and every other outstanding link', async () => {
    const { service, revokedFor, spentAll } = harness({ token: live, userById: userRow() });

    await service.completeReset('anything', 'a-new-password');

    expect(revokedFor).toEqual(['u1']);
    expect(spentAll).toHaveLength(1);
  });

  it('works for a student, who signs in with a username', async () => {
    const { service, userUpdates } = harness({
      token: live,
      userById: userRow({ role: UserRole.STUDENT, username: 'sara' }),
    });

    await service.completeReset('anything', 'a-new-password');

    expect(userUpdates).toHaveLength(1);
  });
});

describe('e-mail is not sent silently into nothing', () => {
  it('says which kind of account the link is for', async () => {
    const teacher = harness({ usersByEmail: [userRow()] });
    await teacher.service.requestReset('teacher@example.com');
    expect(teacher.sent[0].text).toContain('your teacher account');

    const student = harness({ usersByEmail: [userRow({ role: UserRole.STUDENT })] });
    await student.service.requestReset('teacher@example.com');
    expect(student.sent[0].text).toContain('your learning account');
  });

  it('tells her the link expires and can be used once', async () => {
    const { service, sent } = harness({ usersByEmail: [userRow()] });

    await service.requestReset('teacher@example.com');

    expect(sent[0].text).toMatch(/stops working in \d+ minutes/);
    expect(sent[0].text).toContain('only be used once');
  });
});
