import { IsString, MinLength } from 'class-validator';

export class SsoExchangeDto {
  @IsString()
  @MinLength(20)
  accessToken!: string;
}
