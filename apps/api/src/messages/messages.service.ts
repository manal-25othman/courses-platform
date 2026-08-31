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
}
