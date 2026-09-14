/**
 * The bell must not become a way to learn about somebody else's class.
 *
 * `inbox` is the one message route that answers without being told whose
 * conversation to look at, which makes it the one place where the scope is
 * chosen by the server rather than named by the caller. That is exactly the
 * shape of thing that quietly widens: these tests pin the scope for each role
 * and prove the count is built from the same `readAt` a thread already uses,
 * so a bell can never disagree with the conversation it points at.
 */
import { describe, expect, it } from 'vitest';
import { UserRole } from '@prisma/client';
import { MessagesService } from './messages.service';
import { CurrentUser } from '../auth/auth.types';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

const audit = { record: async () => undefined } as unknown as AuditService;

const teacher: CurrentUser = {
  sub: 't1', userId: 't1', role: UserRole.TEACHER, schoolId: 'school-1', mustChangePassword: false,
};
const admin: CurrentUser = {
  sub: 'a1', userId: 'a1', role: UserRole.ADMIN, schoolId: 'school-1', mustChangePassword: false,
};
const student: CurrentUser = {
  sub: 's1', userId: 's1', role: UserRole.STUDENT, schoolId: 'school-1', mustChangePassword: false,
};

/** Remembers the filter the service asked for, which is what is under test. */
function serviceOver({
  grouped = [] as { studentId: string; _count: { _all: number } }[],
  users = [] as { id: string; username: string; studentProfile: { fullName: string } | null }[],
  profile = null as { assignedTeacherId: string | null } | null,
  count = 0,
}) {
  const seen: { groupWhere?: Record<string, unknown>; scopedTo?: string } = {};

  const tx = {
    message: {
      groupBy: async ({ where }: { where: Record<string, unknown> }) => {
        seen.groupWhere = where;
        return grouped;
      },
      count: async ({ where }: { where: Record<string, unknown> }) => {
        seen.groupWhere = where;
        return count;
      },
    },
    user: { findMany: async () => users },
    studentProfile: { findFirst: async () => profile },
  };

  const prisma = {
    forSchool: async <T>(schoolId: string, work: (t: typeof tx) => Promise<T>) => {
      seen.scopedTo = schoolId;
      return work(tx);
    },
  } as unknown as PrismaService;

  return { service: new MessagesService(prisma, audit), seen };
}

describe('the bell is scoped by the server, not by the caller', () => {
  it("counts only a teacher's own conversations", async () => {
    const { service, seen } = serviceOver({
      grouped: [{ studentId: 'p1', _count: { _all: 2 } }],
      users: [{ id: 'p1', username: 'p1', studentProfile: { fullName: 'Sara' } }],
    });

    await service.inbox(teacher);

    // The teacher's own id is the filter. Without this a teacher would be
    // counting the whole school's unread messages.
    expect(seen.groupWhere).toMatchObject({ teacherId: 't1' });
  });

  it('lets a school administrator see the school, and no more', async () => {
    const { service, seen } = serviceOver({
      grouped: [{ studentId: 'p1', _count: { _all: 1 } }],
      users: [{ id: 'p1', username: 'p1', studentProfile: { fullName: 'Sara' } }],
    });

    await service.inbox(admin);

    // No teacherId: an administrator is school-wide by role. The school scope
    // below is what keeps that from meaning "every school".
    expect(seen.groupWhere).not.toHaveProperty('teacherId');
    expect(seen.scopedTo).toBe('school-1');
  });

  it('never reads outside the caller’s own school', async () => {
    for (const actor of [teacher, admin, student]) {
      const { service, seen } = serviceOver({ profile: { assignedTeacherId: 'x' } });
      await service.inbox(actor);
      expect(seen.scopedTo).toBe('school-1');
    }
  });

  it('refuses an account with no school at all', async () => {
    const { service } = serviceOver({});
    await expect(
      service.inbox({ ...teacher, schoolId: null }),
    ).rejects.toThrow(/not attached to a school/i);
  });
});

describe('the bell counts what a conversation already records', () => {
  it('counts only messages the caller did not write, and has not read', async () => {
    const { service, seen } = serviceOver({
      grouped: [{ studentId: 'p1', _count: { _all: 3 } }],
      users: [{ id: 'p1', username: 'p1', studentProfile: { fullName: 'Sara' } }],
    });

    await service.inbox(teacher);

    // Both halves matter: without the first a teacher's own replies would
    // ring her own bell; without the second, opening a thread would not
    // silence it.
    expect(seen.groupWhere).toMatchObject({ senderId: { not: 't1' }, readAt: null });
  });

  it('adds the threads up to the number on the badge', async () => {
    const { service } = serviceOver({
      grouped: [
        { studentId: 'p1', _count: { _all: 2 } },
        { studentId: 'p2', _count: { _all: 5 } },
      ],
      users: [
        { id: 'p1', username: 'p1', studentProfile: { fullName: 'Sara' } },
        { id: 'p2', username: 'p2', studentProfile: { fullName: 'Amal' } },
      ],
    });

    const inbox = await service.inbox(teacher);

    expect(inbox.unread).toBe(7);
    expect(inbox.threads.map((t) => t.name)).toEqual(['Amal', 'Sara']);
  });

  it('puts the loudest thread first, then settles ties by name', async () => {
    const { service } = serviceOver({
      grouped: [
        { studentId: 'p1', _count: { _all: 1 } },
        { studentId: 'p2', _count: { _all: 4 } },
        { studentId: 'p3', _count: { _all: 1 } },
      ],
      users: [
        { id: 'p1', username: 'p1', studentProfile: { fullName: 'Zahra' } },
        { id: 'p2', username: 'p2', studentProfile: { fullName: 'Noura' } },
        { id: 'p3', username: 'p3', studentProfile: { fullName: 'Amal' } },
      ],
    });

    const inbox = await service.inbox(teacher);
    expect(inbox.threads.map((t) => t.name)).toEqual(['Noura', 'Amal', 'Zahra']);
  });

  it('leaves out a student who has since been removed', async () => {
    // The message row survives the account; a name to show and a page to open
    // do not, so the thread is dropped rather than listed as a blank.
    const { service } = serviceOver({
      grouped: [
        { studentId: 'gone', _count: { _all: 3 } },
        { studentId: 'p1', _count: { _all: 1 } },
      ],
      users: [{ id: 'p1', username: 'p1', studentProfile: { fullName: 'Sara' } }],
    });

    const inbox = await service.inbox(teacher);

    expect(inbox.threads).toHaveLength(1);
    expect(inbox.unread).toBe(1);
  });

  it('falls back to the username when a profile has no name yet', async () => {
    const { service } = serviceOver({
      grouped: [{ studentId: 'p1', _count: { _all: 1 } }],
      users: [{ id: 'p1', username: 'sara.q', studentProfile: null }],
    });

    const inbox = await service.inbox(teacher);
    expect(inbox.threads[0].name).toBe('sara.q');
  });
});

describe('a student’s bell is her one conversation', () => {
  it('counts the messages her teacher sent her', async () => {
    const { service, seen } = serviceOver({
      profile: { assignedTeacherId: 't1' },
      count: 2,
    });

    const inbox = await service.inbox(student);

    expect(inbox.unread).toBe(2);
    expect(inbox.threads).toEqual([]);
    expect(seen.groupWhere).toMatchObject({ teacherId: 't1', studentId: 's1' });
  });

  it('is quiet, not broken, for a student with no teacher yet', async () => {
    // She has nowhere a message could come from. That is a silent bell, not an
    // error on every page she opens.
    const { service } = serviceOver({ profile: { assignedTeacherId: null } });

    await expect(service.inbox(student)).resolves.toEqual({ unread: 0, threads: [] });
  });
});
