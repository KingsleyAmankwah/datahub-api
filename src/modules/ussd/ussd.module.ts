import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { UssdController } from './ussd.controller';
import { UssdService } from './ussd.service';
import { UssdMenuService } from './menus/ussd-menu.service';
import { SessionModule } from '../session/session.module';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersModule } from '../orders/orders.module';
import { UssdSignatureGuard } from './guards/ussd-signature.guard';

@Module({
  imports: [UsersModule, SessionModule, PaymentsModule, OrdersModule],
  controllers: [UssdController],
  providers: [UssdService, UssdMenuService, UssdSignatureGuard],
})
export class UssdModule {}
