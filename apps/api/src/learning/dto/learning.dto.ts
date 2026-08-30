import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** One answer a student gives. Its shape depends on the question kind, so the
 *  engine's handler validates it, not this class. */
export class SubmitAnswerDto {
  @IsString()
  @MaxLength(200)
  answerId!: string;

  @IsOptional()
  response?: unknown;
}

export class SubmitAttemptDto {
  /** Keyed by attempt-answer id, so a response can never be attached to a
   *  question the student was not actually shown. */
  @IsObject()
  responses!: Record<string, unknown>;
}
