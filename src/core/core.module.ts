import { Module } from '@nestjs/common';
import { PaymentCoreService } from './payment-core.service';

@Module({
  providers: [PaymentCoreService],
  exports: [PaymentCoreService],
})
export class CoreModule {}
