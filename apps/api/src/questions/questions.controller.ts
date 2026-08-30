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
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser as Actor } from '../auth/auth.types';
import { QuestionsService } from './questions.service';
import {
  CreateQuestionDto,
  PreviewDto,
  SetQuestionStatusDto,
  UpdateQuestionDto,
} from './dto/question.dto';

const TEACHER = [UserRole.TEACHER, UserRole.ADMIN];

/**
 * Questions.
 *
 * Every route here is teacher or admin only, because the stored form includes
 * the answer key. What a student receives comes from the preview route, which
 * goes through the engine and strips the answers (SRS 37).
 */
@Roles(...TEACHER)
@Controller('questions')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  @Get('types')
  async types() {
    return this.questions.listTypes();
  }

  @Get('unit/:unitId')
  async list(
    @CurrentUser() actor: Actor,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Query('needsReview') needsReview?: string,
  ) {
    return this.questions.listForUnit(actor, unitId, needsReview === 'true');
  }

  /** How much of an imported unit still needs a teacher's eye. */
  @Get('unit/:unitId/review-summary')
  async reviewSummary(
    @CurrentUser() actor: Actor,
    @Param('unitId', ParseUUIDPipe) unitId: string,
  ) {
    return this.questions.reviewSummary(actor, unitId);
  }

  /** What a student would see: shuffled, and with no answers. */
  @Post('unit/:unitId/preview')
  @HttpCode(HttpStatus.OK)
  async preview(
    @CurrentUser() actor: Actor,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Body() dto: PreviewDto,
  ) {
    return this.questions.preview(actor, unitId, dto.seed ?? 'preview');
  }

  @Post('unit/:unitId')
  async create(
    @CurrentUser() actor: Actor,
    @Param('unitId', ParseUUIDPipe) unitId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.questions.create(actor, unitId, dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.questions.update(actor, id, dto);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  async setStatus(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetQuestionStatusDto,
  ) {
    return this.questions.setStatus(actor, id, dto.status);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    await this.questions.remove(actor, id);
  }
}
