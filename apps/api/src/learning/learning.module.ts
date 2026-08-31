import { Module } from '@nestjs/common';
import { LearningController } from './learning.controller';
import { LearningService } from './learning.service';
import { QuestionsModule } from '../questions/questions.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [QuestionsModule, SettingsModule],
  controllers: [LearningController],
  providers: [LearningService],
  exports: [LearningService],
})
export class LearningModule {}
