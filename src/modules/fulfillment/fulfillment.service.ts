import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { MockFulfillmentProvider } from './providers/mock-fulfillment.provider';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  FulfillmentProvider,
  FulfillmentStatus,
  Order,
  OrderStatus,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FulfillmentService {
  private readonly logger = new Logger(FulfillmentService.name);
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    private readonly remaData: MockFulfillmentProvider,
    private readonly config: ConfigService,
    private readonly notifications: NotificationsService,
  ) {
    this.maxRetries = parseInt(config.get('FULFILLMENT_MAX_RETRIES', '3'), 10);
    this.retryDelayMs = parseInt(
      config.get('FULFILLMENT_RETRY_DELAY_MS', '5000'),
      10,
    );
  }

  // Called immediately after payment success
  async fulfill(order: Order): Promise<void> {
    const fulfillment = await this.prisma.fulfillment.create({
      data: {
        orderId: order.id,
        provider: FulfillmentProvider.REMADATA,
        status: FulfillmentStatus.PENDING,
      },
    });

    await this.orders.updateStatus(order.id, OrderStatus.FULFILLMENT_INITIATED);

    await this.attemptFulfill(order, fulfillment.id);
  }

  private async attemptFulfill(
    order: Order,
    fulfillmentId: string,
  ): Promise<void> {
    await this.prisma.fulfillment.update({
      where: { id: fulfillmentId },
      data: {
        provider: FulfillmentProvider.REMADATA,
        status: FulfillmentStatus.PROCESSING,
        lastAttemptAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });

    this.logger.log(
      `Fulfillment attempt via RemaData: order=${order.reference}`,
    );

    const result = await this.remaData.fulfill(order);

    if (result.success) {
      await this.prisma.fulfillment.update({
        where: { id: fulfillmentId },
        data: {
          status: FulfillmentStatus.SUCCESS,
          providerRef: result.providerRef,
          providerStatus: result.providerStatus,
          completedAt: new Date(),
        },
      });

      await this.orders.updateStatus(order.id, OrderStatus.FULFILLED);

      // Turn off notifications for now - we can re-enable once we're confident in fulfillment stability
      // this.notifications.sendFulfillmentSuccess(order).catch((err: Error) => {
      //   this.logger.error(
      //     `Notification failed for order ${order.reference}: ${err.message}`,
      //   );
      // });

      this.logger.log(
        `Fulfillment SUCCESS: order=${order.reference} provider=REMADATA`,
      );
    } else {
      const nextRetry = new Date(Date.now() + this.retryDelayMs);

      await this.prisma.fulfillment.update({
        where: { id: fulfillmentId },
        data: {
          status: FulfillmentStatus.FAILED,
          providerStatus: result.providerStatus,
          nextRetryAt: nextRetry,
        },
      });

      await this.orders.updateStatus(order.id, OrderStatus.FULFILLMENT_FAILED);

      // Notifications are currently turned off for fulfillment failures to avoid spamming customers during early testing.
      // this.notifications.sendFulfillmentFailed(order).catch((err: Error) => {
      //   this.logger.error(
      //     `Failure notification error for order ${order.reference}: ${err.message}`,
      //   );
      // });

      this.logger.error(`Fulfillment FAILED: order=${order.reference}`);
    }
  }

  // Runs every 5 minutes — picks up failed fulfillments for retry
  @Cron(CronExpression.EVERY_5_MINUTES)
  async retryFailedFulfillments(): Promise<void> {
    const failed = await this.prisma.fulfillment.findMany({
      where: {
        status: FulfillmentStatus.FAILED,
        attemptCount: { lt: this.maxRetries },
        nextRetryAt: { lte: new Date() },
      },
      include: { order: true },
      take: 20,
    });

    if (!failed.length) return;

    this.logger.log(`Retrying ${failed.length} failed fulfillments`);

    for (const f of failed) {
      await this.attemptFulfill(f.order, f.id);
    }
  }

  // Runs daily at 2am — catches orders stuck after payment success
  @Cron('0 2 * * *')
  async reconcile(): Promise<void> {
    this.logger.log('Running daily fulfillment reconciliation');

    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    const stuck = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PAYMENT_SUCCESS,
        updatedAt: { lt: thirtyMinutesAgo },
      },
      take: 50,
    });

    for (const order of stuck) {
      this.logger.warn(
        `Reconciliation: re-triggering fulfillment for ${order.reference}`,
      );
      await this.fulfill(order);
    }
  }
}
