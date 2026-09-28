import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

const EXTERNAL_JWT_SECRET = 'e2e-external-secret';
const EXTERNAL_JWT_ISSUER = 'external-identity-system';
const EXTERNAL_JWT_AUDIENCE = 'payments-integration-service';

function signValidExternalToken(): string {
  return jwt.sign({ sub: 'e2e-user' }, EXTERNAL_JWT_SECRET, {
    algorithm: 'HS256',
    issuer: EXTERNAL_JWT_ISSUER,
    audience: EXTERNAL_JWT_AUDIENCE,
    expiresIn: '5m',
  });
}

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.EXTERNAL_JWT_SECRET = EXTERNAL_JWT_SECRET;
    process.env.EXTERNAL_JWT_ISSUER = EXTERNAL_JWT_ISSUER;
    process.env.EXTERNAL_JWT_AUDIENCE = EXTERNAL_JWT_AUDIENCE;

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('issues an integration token for a valid external JWT and redeems it', async () => {
    const externalToken = signValidExternalToken();

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login-integration')
      .send({ externalToken });

    expect(loginResponse.status).toBe(200);
    const { integrationToken } = loginResponse.body;
    expect(typeof integrationToken).toBe('string');

    const redeemResponse = await request(app.getHttpServer())
      .post('/auth/redeem')
      .send({ integrationToken });

    expect(redeemResponse.status).toBe(200);
    expect(redeemResponse.body).toEqual({ redeemed: true });
  });

  it('fails when the same integration token is redeemed a second time', async () => {
    const externalToken = signValidExternalToken();
    const { body } = await request(app.getHttpServer())
      .post('/auth/login-integration')
      .send({ externalToken });

    const { integrationToken } = body;

    const firstRedeem = await request(app.getHttpServer())
      .post('/auth/redeem')
      .send({ integrationToken });
    expect(firstRedeem.status).toBe(200);

    const secondRedeem = await request(app.getHttpServer())
      .post('/auth/redeem')
      .send({ integrationToken });

    expect(secondRedeem.status).toBe(401);
    expect(secondRedeem.body).toMatchObject({
      statusCode: 401,
      error: 'INTEGRATION_TOKEN_INVALID',
    });
  });

  it('rejects an invalid external JWT', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login-integration')
      .send({ externalToken: 'not-a-real-jwt' });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      statusCode: 401,
      error: 'INVALID_EXTERNAL_TOKEN',
    });
  });
});
