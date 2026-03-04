import { Matches } from 'class-validator';

export class VerifyTotpDto {
  @Matches(/^\d{6}$/)
  code!: string;
}
