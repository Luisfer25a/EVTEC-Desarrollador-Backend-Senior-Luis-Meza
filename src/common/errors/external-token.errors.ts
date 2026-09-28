import { HttpStatus } from '@nestjs/common';
import { AppError } from './app-error';

export class InvalidExternalTokenError extends AppError {
  readonly code = 'INVALID_EXTERNAL_TOKEN';
  readonly httpStatus = HttpStatus.UNAUTHORIZED;

  constructor() {
    super('The external token is invalid, expired, or was not issued for this service.');
  }
}
