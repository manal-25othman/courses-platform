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
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentUser as Actor } from '../auth/auth.types';
import { ContentService } from './content.service';
import {
  CreateSectionDto,
  CreateUnitDto,
  CreateVocabularyDto,
  SetStatusDto,
  UpdateSectionDto,
  UpdateUnitDto,
  UpdateVocabularyDto,
} from './dto/content.dto';

const TEACHER = [UserRole.TEACHER, UserRole.ADMIN];
const EVERYONE = [UserRole.TEACHER, UserRole.ADMIN, UserRole.STUDENT];

/**
 * The curriculum.
 *
 * Reading is open to students, but they only ever receive published content:
 * the service filters by status according to the caller's role, so draft
 * material a teacher is still preparing is never returned to a student.
 */
@Controller('content')
export class ContentController {
  constructor(private readonly content: ContentService) {}

  /** The kinds of section this curriculum uses. */
  @Roles(...EVERYONE)
  @Get('section-types')
  async sectionTypes() {
    return this.content.listSectionTypes();
  }

  @Roles(...EVERYONE)
  @Get('units')
  async listUnits(@CurrentUser() actor: Actor) {
    return this.content.listUnits(actor);
  }

  @Roles(...EVERYONE)
  @Get('units/:id')
  async getUnit(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.content.getUnit(actor, id);
  }

  @Roles(...TEACHER)
  @Post('units')
  async createUnit(@CurrentUser() actor: Actor, @Body() dto: CreateUnitDto) {
    return this.content.createUnit(actor, dto);
  }

  @Roles(...TEACHER)
  @Patch('units/:id')
  async updateUnit(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUnitDto,
  ) {
    return this.content.updateUnit(actor, id, dto);
  }

  @Roles(...TEACHER)
  @Post('units/:id/status')
  @HttpCode(HttpStatus.OK)
  async setUnitStatus(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStatusDto,
  ) {
    return this.content.setUnitStatus(actor, id, dto.status);
  }

  /** Approves a unit and everything inside it, after the teacher has reviewed it. */
  @Roles(...TEACHER)
  @Post('units/:id/publish')
  @HttpCode(HttpStatus.OK)
  async publishUnit(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.content.publishUnitTree(actor, id);
  }

  @Roles(...TEACHER)
  @Delete('units/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUnit(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    await this.content.deleteUnit(actor, id);
  }

  // --- Sections ------------------------------------------------------------

  @Roles(...TEACHER)
  @Post('units/:id/sections')
  async createSection(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSectionDto,
  ) {
    return this.content.createSection(actor, id, dto);
  }

  @Roles(...TEACHER)
  @Patch('sections/:id')
  async updateSection(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.content.updateSection(actor, id, dto);
  }

  @Roles(...TEACHER)
  @Post('sections/:id/status')
  @HttpCode(HttpStatus.OK)
  async setSectionStatus(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStatusDto,
  ) {
    return this.content.setSectionStatus(actor, id, dto.status);
  }

  @Roles(...TEACHER)
  @Delete('sections/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSection(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    await this.content.deleteSection(actor, id);
  }

  // --- Vocabulary ----------------------------------------------------------

  @Roles(...TEACHER)
  @Post('units/:id/vocabulary')
  async addVocabulary(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateVocabularyDto,
  ) {
    return this.content.addVocabulary(actor, id, dto);
  }

  @Roles(...TEACHER)
  @Patch('vocabulary/:id')
  async updateVocabulary(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateVocabularyDto,
  ) {
    return this.content.updateVocabulary(actor, id, dto);
  }

  @Roles(...TEACHER)
  @Post('vocabulary/:id/status')
  @HttpCode(HttpStatus.OK)
  async setVocabularyStatus(
    @CurrentUser() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetStatusDto,
  ) {
    return this.content.setVocabularyStatus(actor, id, dto.status);
  }

  @Roles(...TEACHER)
  @Delete('vocabulary/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteVocabulary(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    await this.content.deleteVocabulary(actor, id);
  }
}
