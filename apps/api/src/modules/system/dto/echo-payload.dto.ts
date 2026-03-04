import { IsString, MaxLength, MinLength } from 'class-validator';

export class EchoPayloadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  message!: string;
}
