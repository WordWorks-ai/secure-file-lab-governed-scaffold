import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password!: string;

  @IsOptional()
  @Matches(/^\d{6}$/)
  totpCode?: string;

  @IsOptional()
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  webauthnChallengeToken?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(512)
  webauthnCredentialId?: string;
}
