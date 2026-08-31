import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser as Actor } from '../auth/auth.types';
import { ProgressService } from './progress.service';

/**
 * How the class is getting on.
 *
 * Teacher and admin only: this is every student's work, and no student has any
 * business reading another's.
 */
@Roles(UserRole.TEACHER, UserRole.ADMIN)
@Controller('progress')
export class ProgressController {
  constructor(private readonly progress: ProgressService) {}

  @Get('class')
  async classOverview(@CurrentUser() actor: Actor) {
    return this.progress.classOverview(actor);
  }

  @Get('students/:id')
  async student(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.progress.studentDetail(actor, id);
  }
}
