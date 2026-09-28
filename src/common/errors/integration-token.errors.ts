import { HttpStatus } from '@nestjs/common';
import { AppError } from './app-error';

export class IntegrationTokenInvalidError extends AppError {
  readonly code = 'INTEGRATION_TOKEN_INVALID';
  readonly httpStatus = HttpStatus.UNAUTHORIZED;

  constructor() {
    super('The integration token is invalid, expired, or has already been used.');
  }
}
