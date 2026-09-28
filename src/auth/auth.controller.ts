import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginIntegrationResponseDto } from './dto/login-integration-response.dto';
import { LoginIntegrationDto } from './dto/login-integration.dto';
import { RedeemResponseDto } from './dto/redeem-response.dto';
import { RedeemDto } from './dto/redeem.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login-integration')
  @HttpCode(HttpStatus.OK)
  loginIntegration(@Body() dto: LoginIntegrationDto): LoginIntegrationResponseDto {
    return this.authService.loginIntegration(dto);
  }

  @Post('redeem')
  @HttpCode(HttpStatus.OK)
  redeem(@Body() dto: RedeemDto): RedeemResponseDto {
    return this.authService.redeem(dto);
  }
}
