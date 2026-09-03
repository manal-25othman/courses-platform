import { Controller, Get } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser as Actor } from '../auth/auth.types';
import { AdminService } from './admin.service';
import { PlatformOverview } from './admin.types';

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
}
