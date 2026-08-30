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
import { StudentsService, StudentView } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

/**
 * The teacher's student management (SRS 27).
 *
 * Every endpoint is teacher or admin only, and every one is confined to the
 * caller's own students by the service. A student reaching any of these is
 * refused by the role check before the handler runs.
 */
@Roles(UserRole.TEACHER, UserRole.ADMIN)
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  async list(
    @CurrentUser() actor: Actor,
    @Query('includeDeleted') includeDeleted?: string,
  ): Promise<StudentView[]> {
    return this.students.list(actor, includeDeleted === 'true');
  }

  @Get(':id')
  async get(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StudentView> {
    return this.students.get(actor, id);
  }

  @Post()
  async create(
    @CurrentUser() actor: Actor,
    @Body() dto: CreateStudentDto,
  ): Promise<StudentView> {
    return this.students.create(actor, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
  ): Promise<StudentView> {
    return this.students.update(actor, id, dto);
  }

  /** Blocks sign-in, keeps her in the roster. */
  @Post(':id/disable')
  @HttpCode(HttpStatus.OK)
  async disable(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StudentView> {
    return this.students.setStatus(actor, id, UserStatus.DISABLED);
  }

  @Post(':id/enable')
  @HttpCode(HttpStatus.OK)
  async enable(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StudentView> {
    return this.students.setStatus(actor, id, UserStatus.ACTIVE);
  }

  /** Hides her and blocks sign-in. Nothing is erased (SRS 27.1). */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StudentView> {
    return this.students.softDelete(actor, id);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  async restore(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StudentView> {
    return this.students.restore(actor, id);
  }

  /** Returns the temporary password once, for the teacher to pass on. */
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ student: StudentView; temporaryPassword: string }> {
    return this.students.resetPassword(actor, id);
  }
}
