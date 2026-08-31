import { Module } from '@nestjs/common';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';
import { GamesService } from './games.service';
import { QuestionsModule } from '../questions/questions.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [QuestionsModule, SettingsModule],
  controllers: [LearningController],
  providers: [LearningService, GamesService],
  exports: [LearningService],
})
export class LearningModule {}
