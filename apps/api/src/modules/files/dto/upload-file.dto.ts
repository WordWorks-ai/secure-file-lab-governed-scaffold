import { IsBase64, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UploadFileDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(128)
  contentType!: string;

  @IsBase64()
  @MinLength(1)
  contentBase64!: string;

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MinLength(12)
  @MaxLength(256)
  dlpOverrideReason?: string;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(64)
  dlpOverrideTicket?: string;
}
