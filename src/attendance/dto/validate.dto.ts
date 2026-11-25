import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class ValidateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  token: string;
}
