import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { PaymentCoreService } from '../src/core/payment-core.service';

describe('Payments (e2e)', () => {
  let app: INestApplication;
  let processPaymentSpy: jest.SpyInstance;

  beforeAll(async () => {
    process.env.CORE_DELAY_MS = '100';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    
    const coreService = moduleRef.get(PaymentCoreService);
    processPaymentSpy = jest.spyOn(coreService, 'processPayment');
  });

  afterEach(() => {
    processPaymentSpy.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a payment request without Idempotency-Key with a 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/payments')
      .send({ amount: 100, currency: 'USD' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'MISSING_IDEMPOTENCY_KEY',
    });
  });

  it('calls the core exactly once when two requests race with the same Idempotency-Key', async () => {
    const idempotencyKey = 'e2e-concurrent-key';

    const [firstResponse, secondResponse] = await Promise.all([
      request(app.getHttpServer())
        .post('/payments')
        .set('Idempotency-Key', idempotencyKey)
        .send({ amount: 250, currency: 'USD' }),
      request(app.getHttpServer())
        .post('/payments')
        .set('Idempotency-Key', idempotencyKey)
        .send({ amount: 250, currency: 'USD' }),
    ]);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstResponse.body).toEqual(secondResponse.body);
    expect(processPaymentSpy).toHaveBeenCalledTimes(1);
  });

  it('processes a new payment when the Idempotency-Key is different', async () => {
    const response = await request(app.getHttpServer())
      .post('/payments')
      .set('Idempotency-Key', 'e2e-another-key')
      .send({ amount: 50, currency: 'USD' });

    expect(response.status).toBe(200);
    expect(processPaymentSpy).toHaveBeenCalledTimes(1);
  });
});
