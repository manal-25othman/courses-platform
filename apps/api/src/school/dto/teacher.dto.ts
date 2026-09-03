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

/**
 * Adding a teacher to the school.
 *
 * No password field: the administrator is setting up somebody else's account,
 * and one she chooses is a password two people know. The API generates it,
 * shows it once, and the teacher replaces it at her first sign-in — the same
 * arrangement the platform operator gets when she opens a school.
 */
export class CreateTeacherDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  displayName!: string;

  /** The same shape every other username in the platform takes. */
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'Username may contain only letters, numbers, dots, dashes and underscores.',
  })
  username!: string;

  /**
   * Required, as it is for every teacher (SRS 28.5). The school administrator
   * can reset her password, but email is what lets her recover it herself
   * without asking anybody — including out of hours, and including when the
   * administrator is the one who has left.
   *
   * Not unique, and deliberately not checked for uniqueness: the database does
   * not enforce it, and recovery is built to mail every account at an address
   * rather than to assume there is one.
   */
  @IsEmail()
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;
}

export class UpdateTeacherDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'Username may contain only letters, numbers, dots, dashes and underscores.',
  })
  username?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;
}

/**
 * Who a student belongs to.
 *
 * `null` means nobody, which is a real state: a student can arrive before it
 * is settled who will teach her. The teacher named here is checked against
 * this school before anything is written, so the id in the body can only ever
 * name somebody the administrator already manages.
 */
export class AssignStudentDto {
  @ValidateIf((dto: AssignStudentDto) => dto.teacherId !== null)
  @IsUUID()
  teacherId!: string | null;
}
