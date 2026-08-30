import { IsEnum, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ContentStatus } from '@prisma/client';

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
}
