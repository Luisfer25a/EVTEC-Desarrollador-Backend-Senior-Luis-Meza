import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

export interface PaymentCoreResult {
  paymentId: string;
  status: 'APPROVED';
  amount: number;
  currency: string;
  processedAt: string;
}

@Injectable()
export class PaymentCoreService {
  constructor(private readonly configService: ConfigService) {}

  async processPayment(amount: number, currency: string): Promise<PaymentCoreResult> {
    const delayMs = Number(this.configService.get<string>('CORE_DELAY_MS', '200'));
    await this.wait(delayMs);

    return {
      paymentId: randomUUID(),
      status: 'APPROVED',
      amount,
      currency,
      processedAt: new Date().toISOString(),
    };
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
