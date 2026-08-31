import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Asking for a reset link.
 *
 * The address is checked for shape only. Whether it belongs to an account is
 * never reported back, so there is nothing more to validate here.
 */
export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Enter the e-mail address on the account.' })
  @MaxLength(320)
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  token!: string;

  /**
   * The same minimum the change-password route uses. A reset must not be a
   * way to end up with a weaker password than changing one allows.
   */
  @IsString()
  @MinLength(8, { message: 'Your new password must be at least 8 characters.' })
  @MaxLength(200)
  newPassword!: string;
}
