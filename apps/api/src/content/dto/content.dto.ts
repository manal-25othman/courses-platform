import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ContentStatus } from '@prisma/client';

export class CreateUnitDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  /** e.g. "Welcome" or "Grammar Review", to mark material that is not a themed unit. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;
}

export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  kind?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;
}

export class CreateSectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  typeKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;
}

export class UpdateSectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;
}

export class CreateVocabularyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  wordEn!: string;

  /** The Arabic meaning. Present for every word in the supplied material. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  meaningAr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  partOfSpeech?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  exampleSentence?: string;
}

export class UpdateVocabularyDto extends CreateVocabularyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  declare wordEn: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderIndex?: number;
}

/** Moves content between draft and published (SRS 37.7). */
export class SetStatusDto {
  @IsEnum(ContentStatus)
  status!: ContentStatus;
}

export class ReorderDto {
  @IsInt()
  @Min(0)
  @Type(() => Number)
  orderIndex!: number;
}

export class ListContentQuery {
  /** Students only ever see published content; the teacher can see drafts. */
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeDrafts?: boolean;
}
