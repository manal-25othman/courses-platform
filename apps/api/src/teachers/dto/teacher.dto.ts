import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateTeacherProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  title?: string;

  /**
   * Her WhatsApp number, written the way she writes it.
   *
   * Digits, spaces, dashes, brackets and a leading plus are all accepted,
   * because a number is written differently in different places and rejecting
   * a correctly-typed one would be an obstacle for no reason. An empty string
   * takes the number down. The link is built from the digits alone.
   */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Matches(/^$|^\+?[\d\s().-]{8,}$/, {
    message: 'Enter a phone number, including the country code.',
  })
  whatsappPhone?: string;
}
