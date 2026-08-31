import { Module } from '@nestjs/common';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
import { LearningModule } from '../learning/learning.module';

@Module({
  imports: [LearningModule],
  controllers: [ProgressController],
  providers: [ProgressService],
})
export class ProgressModule {}
