import { forwardRef, Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { FulfillmentService } from './fulfillment.service';
import { MockFulfillmentProvider } from './providers/mock-fulfillment.provider';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    OrdersModule,
    forwardRef(() => PaymentsModule),
    NotificationsModule,
  ],
  providers: [FulfillmentService, MockFulfillmentProvider],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
