import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { IntegrationTokenStore } from './integration-token.store';

@Module({
  controllers: [AuthController],
  providers: [AuthService, IntegrationTokenStore],
})
export class AuthModule {}
