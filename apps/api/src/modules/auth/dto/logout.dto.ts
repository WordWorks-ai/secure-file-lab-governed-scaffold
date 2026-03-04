import { IsString, MaxLength, MinLength } from 'class-validator';

export class LogoutDto {
  @IsString()
  @MinLength(20)
  @MaxLength(2048)
  refreshToken!: string;
}
