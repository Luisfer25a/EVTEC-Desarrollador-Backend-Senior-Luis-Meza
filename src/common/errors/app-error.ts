/**
 * Base class for every business error. Subclasses get caught by the
 * global exception filter and turned into the uniform error response
 * shape, so raw messages never leak to the client.
 */
export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly httpStatus: number;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
