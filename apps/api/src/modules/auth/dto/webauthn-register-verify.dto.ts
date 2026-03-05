import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class WebauthnRegisterVerifyDto {
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  challengeToken!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(512)
  credentialId!: string;

  @IsString()
  @MinLength(32)
  @MaxLength(8192)
  clientDataJson!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  publicKey?: string;
}
