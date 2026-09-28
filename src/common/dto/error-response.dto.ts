/** Uniform shape every error response follows, no matter where it came from. */
export class ErrorResponseDto {
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
}
