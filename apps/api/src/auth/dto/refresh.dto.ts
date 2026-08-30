import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RefreshDto {
  /**
   * Only needed by clients that cannot use cookies — a future mobile app.
   * The web app sends the token automatically in an httpOnly cookie.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  refreshToken?: string;
}
