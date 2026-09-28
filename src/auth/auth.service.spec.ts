import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { InvalidExternalTokenError } from '../common/errors/external-token.errors';
import { IntegrationTokenInvalidError } from '../common/errors/integration-token.errors';
import { AuthService } from './auth.service';
import { IntegrationTokenStore } from './integration-token.store';

const EXTERNAL_JWT_SECRET = 'test-external-secret';
const EXTERNAL_JWT_ISSUER = 'external-identity-system';
const EXTERNAL_JWT_AUDIENCE = 'payments-integration-service';

function buildConfigServiceMock(): jest.Mocked<Pick<ConfigService, 'get'>> {
  const values: Record<string, string> = {
    EXTERNAL_JWT_SECRET,
    EXTERNAL_JWT_ISSUER,
    EXTERNAL_JWT_AUDIENCE,
  };

  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as jest.Mocked<Pick<ConfigService, 'get'>>;
}

function signValidExternalToken(overrides: jwt.SignOptions = {}): string {
  return jwt.sign({ sub: 'external-user-1' }, EXTERNAL_JWT_SECRET, {
    algorithm: 'HS256',
    issuer: EXTERNAL_JWT_ISSUER,
    audience: EXTERNAL_JWT_AUDIENCE,
    expiresIn: '5m',
    ...overrides,
  });
}

describe('AuthService', () => {
  let authService: AuthService;
  let integrationTokenStore: IntegrationTokenStore;

  beforeEach(() => {
    integrationTokenStore = new IntegrationTokenStore();
    authService = new AuthService(
      buildConfigServiceMock() as unknown as ConfigService,
      integrationTokenStore,
    );
  });

  describe('loginIntegration', () => {
    it('issues a one-time integration token for a valid external JWT', () => {
      const externalToken = signValidExternalToken();

      const result = authService.loginIntegration({ externalToken });

      expect(result.integrationToken).toEqual(expect.any(String));
      expect(result.integrationToken.length).toBeGreaterThan(0);
      expect(result.expiresInSeconds).toBe(60 * 60);
    });

    it('rejects an expired external token', () => {
      const expiredToken = signValidExternalToken({ expiresIn: '-10s' });

      expect(() => authService.loginIntegration({ externalToken: expiredToken })).toThrow(
        InvalidExternalTokenError,
      );
    });

    it('rejects a token signed with the wrong secret', () => {
      const tokenWithWrongSignature = jwt.sign({ sub: 'external-user-1' }, 'not-the-real-secret', {
        algorithm: 'HS256',
        issuer: EXTERNAL_JWT_ISSUER,
        audience: EXTERNAL_JWT_AUDIENCE,
        expiresIn: '5m',
      });

      expect(() =>
        authService.loginIntegration({ externalToken: tokenWithWrongSignature }),
      ).toThrow(InvalidExternalTokenError);
    });

    it('rejects a token signed with alg "none" (algorithm confusion attack)', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString(
        'base64url',
      );
      const payload = Buffer.from(
        JSON.stringify({
          sub: 'external-user-1',
          iss: EXTERNAL_JWT_ISSUER,
          aud: EXTERNAL_JWT_AUDIENCE,
          exp: Math.floor(Date.now() / 1000) + 300,
        }),
      ).toString('base64url');
      const noneAlgToken = `${header}.${payload}.`;

      expect(() => authService.loginIntegration({ externalToken: noneAlgToken })).toThrow(
        InvalidExternalTokenError,
      );
    });

    it('rejects a token with the wrong issuer', () => {
      const wrongIssuerToken = signValidExternalToken({ issuer: 'someone-else' });

      expect(() => authService.loginIntegration({ externalToken: wrongIssuerToken })).toThrow(
        InvalidExternalTokenError,
      );
    });

    it('rejects a token with the wrong audience', () => {
      const wrongAudienceToken = signValidExternalToken({ audience: 'someone-else' });

      expect(() => authService.loginIntegration({ externalToken: wrongAudienceToken })).toThrow(
        InvalidExternalTokenError,
      );
    });
  });

  describe('redeem', () => {
    it('redeems a freshly issued token successfully', () => {
      const { integrationToken } = authService.loginIntegration({
        externalToken: signValidExternalToken(),
      });

      const result = authService.redeem({ integrationToken });

      expect(result).toEqual({ redeemed: true });
    });

    it('fails the second redemption of the same token', () => {
      const { integrationToken } = authService.loginIntegration({
        externalToken: signValidExternalToken(),
      });

      authService.redeem({ integrationToken });

      expect(() => authService.redeem({ integrationToken })).toThrow(
        IntegrationTokenInvalidError,
      );
    });

    it('fails to redeem a token that was never issued', () => {
      expect(() => authService.redeem({ integrationToken: 'made-up-token' })).toThrow(
        IntegrationTokenInvalidError,
      );
    });
  });
});
