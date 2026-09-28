/**
 * Generates external JWTs signed the way the real external system would,
 * so you can manually try out POST /auth/login-integration with curl or
 * Postman without needing the actual external system running.
 *
 * Usage:
 *   npm run generate:token
 *
 * Reads EXTERNAL_JWT_SECRET / EXTERNAL_JWT_ISSUER / EXTERNAL_JWT_AUDIENCE
 * from .env (falls back to the same defaults as .env.example).
 */
import { config as loadEnv } from 'dotenv';
import * as jwt from 'jsonwebtoken';

loadEnv();

const secret = process.env.EXTERNAL_JWT_SECRET ?? 'super-secret-shared-with-external-system';
const issuer = process.env.EXTERNAL_JWT_ISSUER ?? 'external-identity-system';
const audience = process.env.EXTERNAL_JWT_AUDIENCE ?? 'payments-integration-service';

function signToken(overrides: jwt.SignOptions = {}, signingSecret = secret): string {
  return jwt.sign({ sub: 'test-user-1' }, signingSecret, {
    algorithm: 'HS256',
    issuer,
    audience,
    expiresIn: '10m',
    ...overrides,
  });
}

const validToken = signToken();
const expiredToken = signToken({ expiresIn: '-1m' });
const wrongSignatureToken = signToken({}, `${secret}-but-wrong`);

console.log('--- Token valido (deberia devolver 200 en /auth/login-integration) ---');
console.log(validToken);
console.log();
console.log('--- Token vencido (deberia devolver 401) ---');
console.log(expiredToken);
console.log();
console.log('--- Token con firma incorrecta (deberia devolver 401) ---');
console.log(wrongSignatureToken);
console.log();
console.log('Ejemplo de uso con curl:');
console.log(
  `curl -X POST http://localhost:3000/auth/login-integration -H "Content-Type: application/json" -d '{"externalToken":"${validToken}"}'`,
);
