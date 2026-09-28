import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { MissingIdempotencyKeyError } from '../common/errors/idempotency.errors';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentResponseDto } from './dto/payment-response.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  createPayment(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreatePaymentDto,
  ): Promise<PaymentResponseDto> {
    if (!idempotencyKey) {
      throw new MissingIdempotencyKeyError();
    }

    return this.paymentsService.createPayment(idempotencyKey, dto);
  }
}
