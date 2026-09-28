import { HttpStatus } from '@nestjs/common';
import { AppError } from './app-error';

export class MissingIdempotencyKeyError extends AppError {
  readonly code = 'MISSING_IDEMPOTENCY_KEY';
  readonly httpStatus = HttpStatus.BAD_REQUEST;

  constructor() {
    super('The "Idempotency-Key" header is required for this operation.');
  }
}
