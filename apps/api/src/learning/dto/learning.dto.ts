import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

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

/**
 * How a word was actually played.
 *
 * A student may not simply declare that she heard a word (client,
 * 2026-08-31). The screen sends this only after playback has finished, and
 * naming the source lets the server refuse a claim that could not be true —
 * a teacher's recording, for a word she has not recorded.
 */
export enum AudioSource {
  BROWSER_TTS = 'browser_tts',
  TEACHER_AUDIO = 'teacher_audio',
}

export class AudioPlayedDto {
  @IsEnum(AudioSource)
  source!: AudioSource;
}

/** Her answer to a word check: the meaning she chose, as text. */
export class AnswerCheckDto {
  @IsString()
  @MaxLength(200)
  answer!: string;
}

/** A message to the other party. */
export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}
