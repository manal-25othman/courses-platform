import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../auth/auth.types';
import { UpdateTeacherProfileDto } from './dto/teacher.dto';

/** A teacher's own details, and how a student reaches her. */
export interface TeacherProfileView {
  displayName: string;
  title: string | null;
  whatsappPhone: string | null;
}

/**
 * What a student is told about her teacher.
 *
 * Only what she needs to make contact. Her teacher's e-mail address, username
 * and everything else about the account stay where they are.
 */
export interface MyTeacherView {
  displayName: string;
  title: string | null;
  /** The address that opens WhatsApp, or null where no number is set. */
  whatsappUrl: string | null;
}

/**
 * Reduces a typed number to what WhatsApp needs.
 *
 * `wa.me` takes digits and nothing else — no plus, no spaces, no dashes — so a
 * number typed the way a person writes it is turned into that here rather than
 * asking her to type it in a particular shape. What she typed is what is
 * stored, so she sees her own number back.
 */
export function whatsappDigits(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  // Long enough to be a real international number. A shorter string is a
  // half-typed one, and building a link from it would send a student nowhere.
  return digits.length >= 8 ? digits : null;
}

@Injectable()
export class TeachersService {
  constructor(private readonly prisma: PrismaService) {}

  private schoolOf(actor: CurrentUser): string {
    if (!actor.schoolId) {
      throw new ForbiddenException('Your account is not attached to a school.');
    }
    return actor.schoolId;
  }

  /** Her own profile. */
  async getMine(actor: CurrentUser): Promise<TeacherProfileView> {
    const profile = await this.prisma.forSchool(this.schoolOf(actor), (tx) =>
      tx.teacherProfile.findUnique({ where: { userId: actor.userId } }),
    );

    if (!profile) throw new NotFoundException('Your teacher profile is missing.');

    return {
      displayName: profile.displayName,
      title: profile.title,
      whatsappPhone: profile.whatsappPhone,
    };
  }

  /**
   * Updates her own profile.
   *
   * Her WhatsApp number is hers to set and hers to remove. Nothing about the
   * contact route is written into the platform: with no number set, students
   * are simply not offered it (SRS 26).
   */
  async updateMine(actor: CurrentUser, dto: UpdateTeacherProfileDto): Promise<TeacherProfileView> {
    const profile = await this.prisma.forSchool(this.schoolOf(actor), (tx) =>
      tx.teacherProfile.update({
        where: { userId: actor.userId },
        data: {
          ...(dto.displayName === undefined ? {} : { displayName: dto.displayName.trim() }),
          ...(dto.title === undefined ? {} : { title: dto.title.trim() || null }),
          // An empty string is her taking the number down, which null cannot
          // say — an absent field means "leave it alone".
          ...(dto.whatsappPhone === undefined
            ? {}
            : { whatsappPhone: dto.whatsappPhone.trim() || null }),
        },
      }),
    );

    return {
      displayName: profile.displayName,
      title: profile.title,
      whatsappPhone: profile.whatsappPhone,
    };
  }

  /**
   * The teacher this student is assigned to.
   *
   * Her own teacher and nobody else's: the number comes from the profile the
   * student is actually attached to, so a school with several teachers cannot
   * send a child to the wrong one.
   */
  async forStudent(actor: CurrentUser): Promise<MyTeacherView | null> {
    if (actor.role !== UserRole.STUDENT) {
      throw new ForbiddenException('This is for students.');
    }

    const profile = await this.prisma.forSchool(this.schoolOf(actor), (tx) =>
      tx.studentProfile.findUnique({
        where: { userId: actor.userId },
        include: { assignedTeacher: true },
      }),
    );

    const teacher = profile?.assignedTeacher;
    if (!teacher) return null;

    const digits = whatsappDigits(teacher.whatsappPhone);

    return {
      displayName: teacher.displayName,
      title: teacher.title,
      whatsappUrl: digits ? `https://wa.me/${digits}` : null,
    };
  }
}
