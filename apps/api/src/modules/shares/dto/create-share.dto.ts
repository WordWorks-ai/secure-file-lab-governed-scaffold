import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateShareDto {
  @IsUUID('4')
  fileId!: string;

  @IsISO8601({ strict: true })
  expiresAt!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  maxDownloads?: number;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;

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
