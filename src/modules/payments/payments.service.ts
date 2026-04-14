import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { MtnMomoProvider } from './providers/mtn-momo.provider';
import {
  Order,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { FulfillmentService } from '../fulfillment/fulfillment.service';

interface MoMoCallbackPayload extends Prisma.JsonObject {
  externalId: string;
  status: string;
  financialTransactionId?: string;
  reason?: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    @Inject(forwardRef(() => FulfillmentService))
    private readonly fulfillment: FulfillmentService,
    private readonly mtnMomo: MtnMomoProvider,
  ) {}

  async initiateMoMo(order: Order, payerPhone: string): Promise<void> {
    const result = await this.mtnMomo.initiate(order, payerPhone);

    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        userId: order.userId,
        provider: PaymentProvider.MTN_MOMO,
        amount: order.amount,
        status: result.success ? PaymentStatus.PENDING : PaymentStatus.FAILED,
        providerRef: result.providerRef || null,
        providerStatus: result.providerStatus,
      },
    });

    await this.orders.updateStatus(
      order.id,
      result.success
        ? OrderStatus.PAYMENT_INITIATED
        : OrderStatus.PAYMENT_FAILED,
    );
  }

  async handleMoMoCallback(payload: MoMoCallbackPayload): Promise<void> {
    const { externalId, status } = payload;

    const payment = await this.prisma.payment.findFirst({
      where: { providerRef: externalId },
      include: { order: true },
    });

    if (!payment) {
      this.logger.warn(`MoMo callback: no payment found for ref ${externalId}`);
      return;
    }

    if (status === 'SUCCESSFUL') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCESS,
          providerStatus: status,
          providerPayload: payload,
          completedAt: new Date(),
        },
      });

      await this.orders.updateStatus(
        payment.orderId,
        OrderStatus.PAYMENT_SUCCESS,
      );

      // Trigger bundle fulfillment immediately after payment
      this.fulfillment.fulfill(payment.order).catch((err: Error) => {
        this.logger.error(
          `Fulfillment trigger failed for order ${payment.order.reference}: ${err.message}`,
        );
      });

      this.logger.log(`Payment SUCCESS for order ${payment.order.reference}`);
    } else if (status === 'FAILED') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          providerStatus: status,
          providerPayload: payload,
          completedAt: new Date(),
        },
      });

      await this.orders.updateStatus(
        payment.orderId,
        OrderStatus.PAYMENT_FAILED,
      );

      this.logger.warn(`Payment FAILED for order ${payment.order.reference}`);
    }
  }
}
