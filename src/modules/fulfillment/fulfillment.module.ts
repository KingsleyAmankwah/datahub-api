import { forwardRef, Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { FulfillmentService } from './fulfillment.service';
import { HubtelProvider } from './providers/hubtel.provider';
import { RingoProvider } from './providers/ringo.provider';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    OrdersModule,
    forwardRef(() => PaymentsModule),
    NotificationsModule,
  ],
  providers: [FulfillmentService, HubtelProvider, RingoProvider],
  exports: [FulfillmentService],
})
export class FulfillmentModule {}
