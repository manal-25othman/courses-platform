import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser as Actor } from '../auth/auth.types';
import { AdminService } from './admin.service';
import { CreatedSchool, PlatformOverview, SchoolDetail } from './admin.types';
import { CreateSchoolDto, RenameSchoolDto } from './dto/school.dto';

/**
 * The platform operator's own endpoints.
 *
 * `PLATFORM_ADMIN` and nothing else. The role is declared on the class, so a
 * route added here later is closed to every school role by default rather
 * than by somebody remembering to say so.
 *
 * Nothing in this module is reachable by a teacher or a school administrator,
 * and nothing in the teacher modules becomes reachable by a platform
 * operator: those declare `@Roles(TEACHER, ADMIN)` and PLATFORM_ADMIN is
 * neither.
 *
 * Disabling a school does not close this door on it. The operator is the one
 * person who must still be able to see and reopen a school she has closed, so
 * none of these routes consult the school's status.
 */
@Roles(UserRole.PLATFORM_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /** How big the platform is, and one row per school. Aggregates only. */
  @Get('overview')
  async overview(@CurrentUser() actor: Actor): Promise<PlatformOverview> {
    return this.admin.overview(actor);
  }

  /** One school, in the same shape as its row in the overview. */
  @Get('schools/:schoolId')
  async school(
    @CurrentUser() actor: Actor,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ): Promise<SchoolDetail> {
    return this.admin.school(actor, schoolId);
  }

  /**
   * A school and its first administrator, in one step.
   *
   * The response carries a generated password, which is the one moment in the
   * whole API where a plaintext credential crosses the wire outward. It exists
   * because somebody has to be able to sign in first, and it is never
   * retrievable again — only its hash is kept.
   */
  @Post('schools')
  async createSchool(
    @CurrentUser() actor: Actor,
    @Body() dto: CreateSchoolDto,
  ): Promise<CreatedSchool> {
    return this.admin.createSchool(actor, dto);
  }

  @Patch('schools/:schoolId')
  async renameSchool(
    @CurrentUser() actor: Actor,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
    @Body() dto: RenameSchoolDto,
  ): Promise<SchoolDetail> {
    return this.admin.renameSchool(actor, schoolId, dto.name);
  }

  /**
   * Closing and reopening a school.
   *
   * Two routes rather than one with a body, because these are the two things
   * an operator means to do and each is worth confirming on its own.
   */
  @Post('schools/:schoolId/disable')
  async disableSchool(
    @CurrentUser() actor: Actor,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ): Promise<SchoolDetail> {
    return this.admin.setSchoolStatus(actor, schoolId, UserStatus.DISABLED);
  }

  @Post('schools/:schoolId/enable')
  async enableSchool(
    @CurrentUser() actor: Actor,
    @Param('schoolId', ParseUUIDPipe) schoolId: string,
  ): Promise<SchoolDetail> {
    return this.admin.setSchoolStatus(actor, schoolId, UserStatus.ACTIVE);
  }
}
