import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

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

  /**
   * Who will teach her.
   *
   * Read only when a school administrator is the one adding her: a teacher
   * adding her own student is adding her to her own list, and is never asked
   * to pick herself out of a menu.
   *
   * `null` is a real answer, not a missing one — a girl can arrive before it
   * is settled who will teach her — and it is chosen deliberately rather than
   * arrived at by leaving a field blank. Omitting the field altogether is
   * refused for an administrator, because that is how a student used to be
   * handed silently to whichever teacher happened to come back first.
   */
  @IsOptional()
  @ValidateIf((dto: CreateStudentDto) => dto.assignedTeacherId !== null)
  @IsUUID()
  assignedTeacherId?: string | null;
}
