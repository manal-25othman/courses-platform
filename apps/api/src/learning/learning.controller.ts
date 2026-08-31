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
import { QuestionPurpose, UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser as Actor } from '../auth/auth.types';
import { LearningService } from './learning.service';
import { AnswerCheckDto, AudioPlayedDto, SubmitAttemptDto } from './dto/learning.dto';

/**
 * The student's own screens.
 *
 * Every route is hers alone. A teacher is refused here, not because her seeing
 * the material would be a leak, but because these routes record progress
 * against whoever calls them, and a teacher looking at a unit is not a student
 * learning it. Her preview lives on the questions API.
 */
@Roles(UserRole.STUDENT)
@Controller('learn')
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  @Get('units')
  async units(@CurrentUser() actor: Actor) {
    return this.learning.listUnits(actor);
  }

  @Get('units/:id')
  async unit(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.getUnit(actor, id);
  }

  @Get('units/:id/progress')
  async progress(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.unitProgress(actor, id);
  }

  /** She has looked at the word. */
  @Post('vocabulary/:id/seen')
  @HttpCode(HttpStatus.OK)
  async vocabularySeen(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.markVocabulary(actor, id, 'seen');
  }

  /**
   * The word has just finished playing. Both are needed before it counts.
   *
   * The screen calls this when playback ends, naming what played it. There is
   * no button that says "I heard it": a student may not claim to have heard a
   * word she has not played (client, 2026-08-31).
   */
  @Post('vocabulary/:id/audio-played')
  @HttpCode(HttpStatus.OK)
  async vocabularyAudio(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AudioPlayedDto,
  ) {
    return this.learning.markVocabulary(actor, id, 'audio', dto.source);
  }

  /** The check on a word she has read and heard. */
  @Get('vocabulary/:id/check')
  async vocabularyCheck(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.getVocabularyCheck(actor, id);
  }

  @Post('vocabulary/:id/check')
  @HttpCode(HttpStatus.OK)
  async answerCheck(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnswerCheckDto,
  ) {
    return this.learning.answerVocabularyCheck(actor, id, dto.answer);
  }

  @Post('sections/:id/viewed')
  @HttpCode(HttpStatus.OK)
  async sectionViewed(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.markSectionViewed(actor, id);
  }

  /** Starts an activity, or returns the one already open. */
  @Post('units/:id/activity')
  @HttpCode(HttpStatus.OK)
  async startActivity(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.startActivity(actor, id);
  }

  /**
   * Starts the unit's assessment, or returns the one already open.
   *
   * The same engine, the same frozen questions and the same marking as an
   * activity. What differs is the pool it draws from and the rules around it:
   * a limited number of tries, and a mark to reach (SRS 17, 18).
   */
  @Post('units/:id/assessment')
  @HttpCode(HttpStatus.OK)
  async startAssessment(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.startActivity(actor, id, QuestionPurpose.ASSESSMENT);
  }

  /** Her past tries at this unit's activity, newest first. */
  @Get('units/:id/attempts')
  async attempts(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.listAttempts(actor, id);
  }

  /** Her past tries at this unit's assessment, newest first. */
  @Get('units/:id/assessment/attempts')
  async assessmentAttempts(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.learning.listAttempts(actor, id, QuestionPurpose.ASSESSMENT);
  }

  @Get('attempts/:id')
  async attempt(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.learning.getAttempt(actor, id);
  }

  @Post('attempts/:id/submit')
  @HttpCode(HttpStatus.OK)
  async submit(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.learning.submitActivity(actor, id, dto.responses);
  }
}
