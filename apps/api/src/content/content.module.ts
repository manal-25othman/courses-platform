import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { LearningModule } from '../learning/learning.module';

/**
 * The teacher's side of the curriculum.
 *
 * It borrows GamesService rather than counting playable questions itself, so
 * that what the unit editor reports about Grammar Adventure is measured by the
 * game, not by a second opinion of it.
 */
@Module({
  imports: [LearningModule],
  controllers: [ContentController],
  providers: [ContentService],
})
export class ContentModule {}
