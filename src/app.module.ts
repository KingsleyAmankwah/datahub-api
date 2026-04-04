import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { SessionModule } from './modules/session/session.module';
import { UsersModule } from './modules/users/users.module';
import { UssdModule } from './modules/ussd/ussd.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { FulfillmentModule } from './modules/fulfillment/fulfillment.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuthModule } from './modules/auth/auth.module';
import { BundlesModule } from './modules/bundles/bundles.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    SessionModule,
    UsersModule,
    AuthModule,
    BundlesModule,
    OrdersModule,
    PaymentsModule,
    FulfillmentModule,
    NotificationsModule,
    UssdModule,
  ],
})
export class AppModule {}
