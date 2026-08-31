import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ContentStatus, QuestionPurpose } from '@prisma/client';

export class CreateQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  typeKey!: string;

  /** The question exactly as written in the curriculum. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  prompt!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsObject()
  answerKey!: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  points?: number;

  /** Practice, or the unit's assessment. Practice unless she says otherwise. */
  @IsOptional()
  @IsEnum(QuestionPurpose)
  purpose?: QuestionPurpose;

  /**
   * The grammar section this exercise goes with, when there is one.
   *
   * A curriculum page often explains a rule and then practises it. Linking the
   * two lets a student jump back to the explanation from the exercise.
   */
  @IsOptional()
  @IsUUID()
  sectionId?: string;
}

export class UpdateQuestionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  prompt?: string;

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  answerKey?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  points?: number;

  @IsOptional()
  @IsEnum(QuestionPurpose)
  purpose?: QuestionPurpose;

  /**
   * The grammar section this exercise goes with. An empty string unlinks it,
   * which null cannot do — an absent field means "leave it alone".
   */
  @IsOptional()
  @IsString()
  sectionId?: string;

  /** Cleared by the teacher once she has checked an uncertain import. */
  @IsOptional()
  reviewed?: boolean;
}

export class SetQuestionStatusDto {
  @IsEnum(ContentStatus)
  status!: ContentStatus;
}

export class PreviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  seed?: string;

  /** Which pool to preview. Both, if left out. */
  @IsOptional()
  @IsEnum(QuestionPurpose)
  purpose?: QuestionPurpose;
}
