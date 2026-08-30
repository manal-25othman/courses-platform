import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateStudentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName!: string;

  /**
   * Letters, numbers, dots, dashes and underscores only. Kept simple because
   * a Grade 6 student has to type it reliably.
   */
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'Username may contain only letters, numbers, dots, dashes and underscores.',
  })
  username!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  /** Optional, per SRS 28.3. Without it she recovers her password through her teacher. */
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;
}
