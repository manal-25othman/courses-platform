import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  password!: string;

  /**
   * Which school the username belongs to.
   *
   * Usernames are unique within a school, not across all of them, so this is
   * needed once there is more than one school. With a single school the API
   * resolves it automatically, so the client may leave it out.
   */
  @IsOptional()
  @IsUUID()
  schoolId?: string;
}
