import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AccessShareDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  shareToken!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password?: string;
}
