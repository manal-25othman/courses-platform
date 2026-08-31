import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser as Actor } from '../auth/auth.types';
import { TeachersService } from './teachers.service';
import { UpdateTeacherProfileDto } from './dto/teacher.dto';

/**
 * A teacher's own details, and the one thing a student is told about hers.
 */
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @Get('me')
  async mine(@CurrentUser() actor: Actor) {
    return this.teachers.getMine(actor);
  }

  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @Patch('me')
  async updateMine(@CurrentUser() actor: Actor, @Body() dto: UpdateTeacherProfileDto) {
    return this.teachers.updateMine(actor, dto);
  }

  /**
   * Her own teacher, and how to reach her.
   *
   * Only the teacher this student is assigned to, so a school with several
   * teachers cannot send a child to the wrong one. Null when she has no
   * teacher assigned, and no WhatsApp address when her teacher has set no
   * number — in which case she is simply not offered it.
   */
  @Roles(UserRole.STUDENT)
  @Get('mine')
  async forStudent(@CurrentUser() actor: Actor) {
    return this.teachers.forStudent(actor);
  }
}
