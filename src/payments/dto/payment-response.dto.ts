export class PaymentResponseDto {
  paymentId: string;
  status: 'APPROVED';
  amount: number;
  currency: string;
  processedAt: string;
}
