import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser as Actor } from '../auth/auth.types';
import { MessagesService } from './messages.service';
import { SendMessageDto } from '../learning/dto/learning.dto';

/**
 * Feedback, from both sides.
 *
 * The student's routes take no student id: hers is the only conversation she
 * has, and it is read from her own account rather than from the request.
 */
@Controller('messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  // --- The student's own conversation --------------------------------------

  @Roles(UserRole.STUDENT)
  @Get('mine')
  async mine(@CurrentUser() actor: Actor) {
    return this.messages.conversation(actor);
  }

  @Roles(UserRole.STUDENT)
  @Get('mine/unread')
  async myUnread(@CurrentUser() actor: Actor) {
    return this.messages.unreadCount(actor);
  }

  @Roles(UserRole.STUDENT)
  @Post('mine')
  async reply(@CurrentUser() actor: Actor, @Body() dto: SendMessageDto) {
    return this.messages.send(actor, dto.body);
  }

  @Roles(UserRole.STUDENT)
  @Post('mine/read')
  @HttpCode(HttpStatus.OK)
  async markMineRead(@CurrentUser() actor: Actor) {
    return this.messages.markRead(actor);
  }

  // --- The teacher's side --------------------------------------------------

  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @Get('students/:id')
  async withStudent(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.messages.conversation(actor, id);
  }

  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @Post('students/:id')
  async sendToStudent(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messages.send(actor, dto.body, id);
  }

  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @Post('students/:id/read')
  @HttpCode(HttpStatus.OK)
  async markStudentRead(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.messages.markRead(actor, id);
  }
}
