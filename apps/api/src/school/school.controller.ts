import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser as Actor } from '../auth/auth.types';
import { SchoolService } from './school.service';
import { AssignableStudent, CreatedTeacher, SchoolOverview, TeacherView } from './school.types';
import { AssignStudentDto, CreateTeacherDto, UpdateTeacherDto } from './dto/teacher.dto';

/**
 * The school administrator's office.
 *
 * `ADMIN` and nothing else, declared on the class so a route added here later
 * is closed to every other role by default. Three exclusions are deliberate:
 *
 *  - A TEACHER cannot reach any of it. She manages her own students, not her
 *    colleagues' accounts.
 *  - A STUDENT cannot reach any of it.
 *  - A PLATFORM_ADMIN cannot reach any of it either. She has no school, so
 *    there is no "her school" for these routes to mean — and inheriting a
 *    tenant's management powers is exactly what the platform boundary exists
 *    to prevent. She manages schools; she does not work inside one.
 *
 * A closed school closes this too: `school_is_active` is consulted when the
 * administrator signs in, when her session is renewed, and when a screen asks
 * who she is, so she cannot administer a school the platform has shut.
 */
@Roles(UserRole.ADMIN)
@Controller('school')
export class SchoolController {
  constructor(private readonly school: SchoolService) {}

  /** Counts and the two gaps she can close. */
  @Get('overview')
  async overview(@CurrentUser() actor: Actor): Promise<SchoolOverview> {
    return this.school.overview(actor);
  }

  @Get('teachers')
  async listTeachers(
    @CurrentUser() actor: Actor,
    @Query('includeRemoved') includeRemoved?: string,
  ): Promise<TeacherView[]> {
    return this.school.listTeachers(actor, includeRemoved === 'true');
  }

  @Get('teachers/:id')
  async getTeacher(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TeacherView> {
    return this.school.getTeacher(actor, id);
  }

  /**
   * Adds a teacher. The response carries a generated password, which is the
   * only moment it exists in readable form anywhere.
   */
  @Post('teachers')
  async createTeacher(
    @CurrentUser() actor: Actor,
    @Body() dto: CreateTeacherDto,
  ): Promise<CreatedTeacher> {
    return this.school.createTeacher(actor, dto);
  }

  @Patch('teachers/:id')
  async updateTeacher(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeacherDto,
  ): Promise<TeacherView> {
    return this.school.updateTeacher(actor, id, dto);
  }

  /** Blocks sign-in and ends her sessions; keeps her in the list. */
  @Post('teachers/:id/disable')
  @HttpCode(HttpStatus.OK)
  async disableTeacher(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TeacherView> {
    return this.school.setTeacherStatus(actor, id, UserStatus.DISABLED);
  }

  @Post('teachers/:id/enable')
  @HttpCode(HttpStatus.OK)
  async enableTeacher(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TeacherView> {
    return this.school.setTeacherStatus(actor, id, UserStatus.ACTIVE);
  }

  /** Reversible: hides her and stops her signing in. Nothing is erased. */
  @Delete('teachers/:id')
  async removeTeacher(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TeacherView> {
    return this.school.removeTeacher(actor, id);
  }

  @Post('teachers/:id/restore')
  @HttpCode(HttpStatus.OK)
  async restoreTeacher(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TeacherView> {
    return this.school.restoreTeacher(actor, id);
  }

  @Post('teachers/:id/reset-password')
  @HttpCode(HttpStatus.OK)
  async resetTeacherPassword(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ teacher: TeacherView; temporaryPassword: string }> {
    return this.school.resetTeacherPassword(actor, id);
  }

  /** Who teaches whom. Names and usernames only — no marks, no progress. */
  @Get('students')
  async students(@CurrentUser() actor: Actor): Promise<AssignableStudent[]> {
    return this.school.students(actor);
  }

  @Post('students/:id/assign')
  @HttpCode(HttpStatus.OK)
  async assignStudent(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignStudentDto,
  ): Promise<AssignableStudent> {
    return this.school.assignStudent(actor, id, dto.teacherId);
  }
}
