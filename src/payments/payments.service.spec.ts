import { PaymentCoreService, PaymentCoreResult } from '../core/payment-core.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

function buildPaymentCoreMock(delayMs = 20): jest.Mocked<Pick<PaymentCoreService, 'processPayment'>> {
  let callCount = 0;

  return {
    processPayment: jest
      .fn()
      .mockImplementation((amount: number, currency: string): Promise<PaymentCoreResult> => {
        callCount += 1;
        const paymentId = `payment-${callCount}`;
        return new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                paymentId,
                status: 'APPROVED',
                amount,
                currency,
                processedAt: new Date().toISOString(),
              }),
            delayMs,
          ),
        );
      }),
  };
}

describe('PaymentsService', () => {
  const dto: CreatePaymentDto = { amount: 100, currency: 'USD' };

  it('calls the core exactly once for a single request', async () => {
    const coreMock = buildPaymentCoreMock();
    const service = new PaymentsService(coreMock as unknown as PaymentCoreService);

    const result = await service.createPayment('key-1', dto);

    expect(coreMock.processPayment).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('APPROVED');
  });

  it('collapses two concurrent requests with the same idempotency key into a single core call', async () => {
    const coreMock = buildPaymentCoreMock();
    const service = new PaymentsService(coreMock as unknown as PaymentCoreService);

    const [firstResponse, secondResponse] = await Promise.all([
      service.createPayment('same-key', dto),
      service.createPayment('same-key', dto),
    ]);

    expect(coreMock.processPayment).toHaveBeenCalledTimes(1);
    expect(firstResponse).toEqual(secondResponse);
  });

  it('makes a new core call for a different idempotency key', async () => {
    const coreMock = buildPaymentCoreMock();
    const service = new PaymentsService(coreMock as unknown as PaymentCoreService);

    await service.createPayment('key-a', dto);
    await service.createPayment('key-b', dto);

    expect(coreMock.processPayment).toHaveBeenCalledTimes(2);
  });

  it('retries the core if the previous attempt for the same key failed', async () => {
    const failingThenSucceeding = jest
      .fn()
      .mockRejectedValueOnce(new Error('core temporarily unavailable'))
      .mockResolvedValueOnce({
        paymentId: 'payment-retry',
        status: 'APPROVED',
        amount: 100,
        currency: 'USD',
        processedAt: new Date().toISOString(),
      });

    const coreMock = { processPayment: failingThenSucceeding } as unknown as PaymentCoreService;
    const service = new PaymentsService(coreMock);

    await expect(service.createPayment('retry-key', dto)).rejects.toThrow(
      'core temporarily unavailable',
    );

    const secondAttempt = await service.createPayment('retry-key', dto);

    expect(failingThenSucceeding).toHaveBeenCalledTimes(2);
    expect(secondAttempt.paymentId).toBe('payment-retry');
  });
});
