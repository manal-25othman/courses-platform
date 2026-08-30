import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Every field optional: the teacher changes only what she wants to change. */
export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'Username may contain only letters, numbers, dots, dashes and underscores.',
  })
  username?: string;

  /** Send an empty string to remove the address; email is optional (SRS 28.3). */
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string | null;
}
