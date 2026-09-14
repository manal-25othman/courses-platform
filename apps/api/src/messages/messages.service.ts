import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService, AUDIT_ACTIONS } from '../audit/audit.service';
import { CurrentUser } from '../auth/auth.types';

/**
 * Feedback between a teacher and one of her students.
 *
 * Deliberately not a chat. A message is written, read once, and answered; there
 * is nothing live about it and nothing is pushed anywhere. Everything a
 * conversation needs — who wrote it, when, and whether the other person has
 * seen it — is on the row.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private schoolOf(actor: CurrentUser): string {
    if (!actor.schoolId) {
      throw new ForbiddenException('Your account is not attached to a school.');
    }
    return actor.schoolId;
  }

  /**
   * Establishes who the two people in a conversation are.
   *
   * A teacher names the student; a student's teacher is the one she is
   * assigned to. Neither can choose the other side freely, so nobody can start
   * a conversation with someone who is not theirs.
   */
  private async participants(
    actor: CurrentUser,
    studentId?: string,
  ): Promise<{ teacherId: string; studentId: string }> {
    const schoolId = this.schoolOf(actor);

    if (actor.role === UserRole.STUDENT) {
      const profile = await this.prisma.forSchool(schoolId, (tx) =>
        tx.studentProfile.findFirst({ where: { userId: actor.userId } }),
      );

      if (!profile?.assignedTeacherId) {
        throw new NotFoundException('You do not have a teacher assigned yet.');
      }

      return { teacherId: profile.assignedTeacherId, studentId: actor.userId };
    }

    if (!studentId) throw new NotFoundException('Student not found.');

    const scope: Prisma.UserWhereInput = {
      id: studentId,
      role: UserRole.STUDENT,
      schoolId,
      deletedAt: null,
    };

    // A teacher may only write to her own students (SRS 35).
    if (actor.role === UserRole.TEACHER) {
      scope.studentProfile = { assignedTeacherId: actor.userId };
    }

    const student = await this.prisma.forSchool(schoolId, (tx) =>
      tx.user.findFirst({ where: scope }),
    );

    if (!student) throw new NotFoundException('Student not found.');

    // An admin writing to a student is recorded against the student's own
    // teacher, so the conversation stays in one place.
    if (actor.role !== UserRole.TEACHER) {
      const profile = await this.prisma.forSchool(schoolId, (tx) =>
        tx.studentProfile.findFirst({ where: { userId: studentId } }),
      );

      if (!profile?.assignedTeacherId) {
        throw new NotFoundException('That student has no teacher assigned.');
      }

      return { teacherId: profile.assignedTeacherId, studentId };
    }

    return { teacherId: actor.userId, studentId };
  }

  /** One conversation, oldest first, as a thread reads. */
  async conversation(actor: CurrentUser, studentId?: string) {
    const schoolId = this.schoolOf(actor);
    const pair = await this.participants(actor, studentId);

    return this.prisma.forSchool(schoolId, async (tx) => {
      const messages = await tx.message.findMany({
        where: { teacherId: pair.teacherId, studentId: pair.studentId },
        orderBy: { createdAt: 'asc' },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              role: true,
              teacherProfile: { select: { displayName: true } },
              studentProfile: { select: { fullName: true } },
            },
          },
        },
      });

      return messages.map((message) => ({
        id: message.id,
        body: message.body,
        createdAt: message.createdAt,
        readAt: message.readAt,
        fromMe: message.senderId === actor.userId,
        senderName:
          message.sender.teacherProfile?.displayName ??
          message.sender.studentProfile?.fullName ??
          message.sender.username,
        senderRole: message.sender.role,
      }));
    });
  }

  /** Writes one. */
  async send(actor: CurrentUser, body: string, studentId?: string) {
    const schoolId = this.schoolOf(actor);
    const pair = await this.participants(actor, studentId);

    const message = await this.prisma.forSchool(schoolId, (tx) =>
      tx.message.create({
        data: {
          schoolId,
          teacherId: pair.teacherId,
          studentId: pair.studentId,
          senderId: actor.userId,
          body: body.trim(),
        },
      }),
    );

    await this.audit.record({
      action: AUDIT_ACTIONS.MESSAGE_SENT,
      schoolId,
      actorUserId: actor.userId,
      targetType: 'message',
      targetId: message.id,
    });

    return { id: message.id, createdAt: message.createdAt };
  }

  /**
   * Marks what the caller has now seen.
   *
   * Only the other person's messages: reading your own back does not make it
   * read by anybody.
   */
  async markRead(actor: CurrentUser, studentId?: string) {
    const schoolId = this.schoolOf(actor);
    const pair = await this.participants(actor, studentId);

    const result = await this.prisma.forSchool(schoolId, (tx) =>
      tx.message.updateMany({
        where: {
          teacherId: pair.teacherId,
          studentId: pair.studentId,
          senderId: { not: actor.userId },
          readAt: null,
        },
        data: { readAt: new Date() },
      }),
    );

    return { marked: result.count };
  }

  /** How many messages are waiting for the caller. */
  async unreadCount(actor: CurrentUser, studentId?: string) {
    const schoolId = this.schoolOf(actor);
    const pair = await this.participants(actor, studentId);

    const unread = await this.prisma.forSchool(schoolId, (tx) =>
      tx.message.count({
        where: {
          teacherId: pair.teacherId,
          studentId: pair.studentId,
          senderId: { not: actor.userId },
          readAt: null,
        },
      }),
    );

    return { unread };
  }

  /**
   * What is waiting, across every conversation the caller has.
   *
   * The per-conversation count above answers "is there anything new from this
   * one person", which is what a thread needs. A bell needs the other
   * question — "is there anything new at all" — and for a teacher with a class
   * that is a different sum, one she cannot get by opening every student in
   * turn.
   *
   * Nothing new is stored for this. It reads the same `readAt` the
   * conversation already keeps, so a message opened in a thread stops counting
   * here with no second thing to keep in step.
   */
  async inbox(actor: CurrentUser): Promise<{
    unread: number;
    threads: { studentId: string; name: string; unread: number }[];
  }> {
    const schoolId = this.schoolOf(actor);

    if (actor.role === UserRole.STUDENT) {
      // A student has one teacher, so her bell is her one conversation. An
      // unassigned student has nowhere for a message to come from, and that
      // is a quiet bell rather than an error on every page she opens.
      const profile = await this.prisma.forSchool(schoolId, (tx) =>
        tx.studentProfile.findFirst({ where: { userId: actor.userId } }),
      );
      if (!profile?.assignedTeacherId) return { unread: 0, threads: [] };

      const unread = await this.prisma.forSchool(schoolId, (tx) =>
        tx.message.count({
          where: {
            teacherId: profile.assignedTeacherId!,
            studentId: actor.userId,
            senderId: { not: actor.userId },
            readAt: null,
          },
        }),
      );
      return { unread, threads: [] };
    }

    /*
      A teacher sees only her own students, and an admin sees the school's.
      This is the same rule `participants` applies one student at a time,
      written once here over the whole set rather than relaxed.
    */
    const mine: Prisma.MessageWhereInput = {
      senderId: { not: actor.userId },
      readAt: null,
      ...(actor.role === UserRole.TEACHER ? { teacherId: actor.userId } : {}),
    };

    const grouped = await this.prisma.forSchool(schoolId, (tx) =>
      tx.message.groupBy({ by: ['studentId'], where: mine, _count: { _all: true } }),
    );

    if (grouped.length === 0) return { unread: 0, threads: [] };

    // Named, because "3 unread" without a name is not something a teacher can
    // act on. One query for the names rather than one per thread.
    const students = await this.prisma.forSchool(schoolId, (tx) =>
      tx.user.findMany({
        where: { id: { in: grouped.map((g) => g.studentId) }, deletedAt: null },
        select: { id: true, username: true, studentProfile: { select: { fullName: true } } },
      }),
    );
    const nameOf = new Map(
      students.map((u) => [u.id, u.studentProfile?.fullName ?? u.username]),
    );

    const threads = grouped
      // A student removed since the message was written has no name to show,
      // and nothing useful to open, so she is left out of the list.
      .filter((g) => nameOf.has(g.studentId))
      .map((g) => ({
        studentId: g.studentId,
        name: nameOf.get(g.studentId)!,
        unread: g._count._all,
      }))
      .sort((a, b) => b.unread - a.unread || a.name.localeCompare(b.name));

    return { unread: threads.reduce((sum, t) => sum + t.unread, 0), threads };
  }
}
