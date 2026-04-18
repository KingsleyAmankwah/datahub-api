import { forwardRef, Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MtnMomoProvider } from './providers/mtn-momo.provider';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';
import { DevPaymentTestController } from './payments-dev.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    forwardRef(() => OrdersModule),
    forwardRef(() => FulfillmentModule),
    UsersModule,
  ],
  controllers: [PaymentsController, DevPaymentTestController],
  providers: [PaymentsService, MtnMomoProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
