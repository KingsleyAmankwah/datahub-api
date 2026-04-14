import { forwardRef, Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { FulfillmentService } from './fulfillment.service';
import { RemaDataProvider } from './providers/rema-data.provider';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    OrdersModule,
    forwardRef(() => PaymentsModule),
    NotificationsModule,
  ],
  providers: [FulfillmentService, RemaDataProvider],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
