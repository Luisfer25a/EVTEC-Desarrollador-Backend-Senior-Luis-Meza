import { Injectable } from '@nestjs/common';
import { IntegrationTokenInvalidError } from '../common/errors/integration-token.errors';

interface IntegrationTokenEntry {
  expiresAt: number;
  used: boolean;
}

@Injectable()
export class IntegrationTokenStore {
  private readonly tokens = new Map<string, IntegrationTokenEntry>();

  issue(token: string, ttlMs: number): void {
    this.tokens.set(token, { expiresAt: Date.now() + ttlMs, used: false });
  }

  redeem(token: string): void {
    const entry = this.tokens.get(token);

    if (!entry || entry.used || entry.expiresAt < Date.now()) {
      throw new IntegrationTokenInvalidError();
    }

    entry.used = true;
  }
}
