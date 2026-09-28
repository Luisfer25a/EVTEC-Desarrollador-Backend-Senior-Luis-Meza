import { Injectable } from '@nestjs/common';
import { PaymentCoreService } from '../core/payment-core.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';

@Injectable()
export class PaymentsService {
  private readonly idempotencyStore = new Map<string, Promise<PaymentResponseDto>>();

  constructor(private readonly paymentCoreService: PaymentCoreService) {}

  createPayment(idempotencyKey: string, dto: CreatePaymentDto): Promise<PaymentResponseDto> {
    const existingPayment = this.idempotencyStore.get(idempotencyKey);
    if (existingPayment) {
      return existingPayment;
    }

    const paymentPromise = this.callCore(dto);
    this.idempotencyStore.set(idempotencyKey, paymentPromise);

    paymentPromise.catch(() => {
      // a genuine failure shouldn't permanently block retries with the same key.
      this.idempotencyStore.delete(idempotencyKey);
    });

    return paymentPromise;
  }

  private async callCore(dto: CreatePaymentDto): Promise<PaymentResponseDto> {
    const result = await this.paymentCoreService.processPayment(dto.amount, dto.currency);

    return {
      paymentId: result.paymentId,
      status: result.status,
      amount: result.amount,
      currency: result.currency,
      processedAt: result.processedAt,
    };
  }
}
