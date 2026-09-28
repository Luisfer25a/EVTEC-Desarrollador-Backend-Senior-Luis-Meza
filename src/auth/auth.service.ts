import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import * as jwt from 'jsonwebtoken';
import { InvalidExternalTokenError } from '../common/errors/external-token.errors';
import { LoginIntegrationResponseDto } from './dto/login-integration-response.dto';
import { LoginIntegrationDto } from './dto/login-integration.dto';
import { RedeemResponseDto } from './dto/redeem-response.dto';
import { RedeemDto } from './dto/redeem.dto';
import { IntegrationTokenStore } from './integration-token.store';

const INTEGRATION_TOKEN_TTL_MS = 60 * 60 * 1000;
const INTEGRATION_TOKEN_BYTES = 32;

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly integrationTokenStore: IntegrationTokenStore,
  ) {}

  loginIntegration(dto: LoginIntegrationDto): LoginIntegrationResponseDto {
    this.verifyExternalToken(dto.externalToken);

    const integrationToken = randomBytes(INTEGRATION_TOKEN_BYTES).toString('hex');
    this.integrationTokenStore.issue(integrationToken, INTEGRATION_TOKEN_TTL_MS);

    return {
      integrationToken,
      expiresInSeconds: INTEGRATION_TOKEN_TTL_MS / 1000,
    };
  }

  redeem(dto: RedeemDto): RedeemResponseDto {
    this.integrationTokenStore.redeem(dto.integrationToken);
    return { redeemed: true };
  }

  private verifyExternalToken(token: string): void {
    const secret = this.configService.get<string>('EXTERNAL_JWT_SECRET');
    const issuer = this.configService.get<string>('EXTERNAL_JWT_ISSUER');
    const audience = this.configService.get<string>('EXTERNAL_JWT_AUDIENCE');

    try {
      jwt.verify(token, secret as string, {
        algorithms: ['HS256'],
        issuer,
        audience,
      });
    } catch {
      throw new InvalidExternalTokenError();
    }
  }
}
