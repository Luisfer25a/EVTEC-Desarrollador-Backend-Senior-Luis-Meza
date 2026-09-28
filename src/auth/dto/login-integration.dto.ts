import { IsNotEmpty, IsString } from 'class-validator';

export class LoginIntegrationDto {
  @IsString()
  @IsNotEmpty()
  externalToken: string;
}
