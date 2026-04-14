import { forwardRef, Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { MtnMomoProvider } from './providers/mtn-momo.provider';
import { FulfillmentModule } from '../fulfillment/fulfillment.module';

@Module({
  imports: [OrdersModule, forwardRef(() => FulfillmentModule)],
  controllers: [PaymentsController],
  providers: [PaymentsService, MtnMomoProvider],
  exports: [PaymentsService],
})
export class PaymentsModule {}
