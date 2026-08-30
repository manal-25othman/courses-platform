import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { QuestionEngineService } from './question-engine.service';

@Module({
  controllers: [QuestionsController],
  providers: [QuestionsService, QuestionEngineService],
  exports: [QuestionEngineService],
})
export class QuestionsModule {}
