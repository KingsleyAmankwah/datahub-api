import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { OrdersService } from '../orders/orders.service';
import { PaystackProvider } from './providers/paystack.provider';
import {
  Order,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { FulfillmentService } from '../fulfillment/fulfillment.service';
import { AgentsService } from '../agents/agents.service';

interface PaystackWebhookPayload extends Prisma.JsonObject {
  event: string;
  data: {
    reference: string;
    status: string;
    id: number;
    gateway_response: string;
    metadata?: { walletTopUp?: { userId: string; amount: number } };
  };
}

interface WalletTopUpPayload extends Prisma.JsonObject {
  walletTopUp: { userId: string; amount: number };
}

function isWalletTopUpPayload(
  payload: Prisma.JsonValue | null,
): payload is WalletTopUpPayload {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    !Array.isArray(payload) &&
    'walletTopUp' in payload &&
    typeof (payload as WalletTopUpPayload).walletTopUp?.userId === 'string'
  );
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orders: OrdersService,
    @Inject(forwardRef(() => FulfillmentService))
    private readonly fulfillment: FulfillmentService,
    private readonly paystack: PaystackProvider,
    @Inject(forwardRef(() => AgentsService))
    private readonly agentsService: AgentsService,
  ) {}

  async initiatePaystack(
    order: Order,
    payerPhone: string,
  ): Promise<{ authorizationUrl: string }> {
    const result = await this.paystack.initiate(
      { reference: order.reference, amount: order.amount },
      payerPhone,
    );

    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        userId: order.userId,
        provider: PaymentProvider.PAYSTACK,
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

    return { authorizationUrl: result.message ?? '' };
  }

  async initiateWalletTopUp(
    userId: string,
    amount: number,
    payerPhone: string,
  ): Promise<{ providerRef: string; authorizationUrl: string }> {
    const result = await this.paystack.initiate(
      { reference: `TOPUP-${userId}-${Date.now()}`, amount },
      payerPhone,
    );

    if (!result.success) {
      throw new Error(result.message ?? 'Paystack initiation failed');
    }

    await this.prisma.payment.create({
      data: {
        userId,
        provider: PaymentProvider.PAYSTACK,
        amount,
        status: PaymentStatus.PENDING,
        providerRef: result.providerRef,
        providerStatus: result.providerStatus,
        providerPayload: { walletTopUp: { userId, amount } },
      },
    });

    this.logger.log(
      `Wallet top-up initiated: userId=${userId} amount=${amount} ref=${result.providerRef}`,
    );
    return {
      providerRef: result.providerRef,
      authorizationUrl: result.message ?? '',
    };
  }

  async handlePaystackWebhook(payload: PaystackWebhookPayload): Promise<void> {
    if (!payload.event.startsWith('charge.')) return;

    const { reference, status } = payload.data;

    const payment = await this.prisma.payment.findFirst({
      where: { providerRef: reference },
      include: { order: true },
    });

    if (!payment) {
      this.logger.warn(
        `Paystack webhook: no payment found for ref ${reference}`,
      );
      return;
    }

    const isWalletTopUp =
      !payment.orderId && isWalletTopUpPayload(payment.providerPayload);

    if (status === 'success') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.SUCCESS,
          providerStatus: status,
          providerPayload: payload as unknown as Prisma.JsonObject,
          completedAt: new Date(),
        },
      });

      if (isWalletTopUp && isWalletTopUpPayload(payment.providerPayload)) {
        const { userId, amount } = payment.providerPayload.walletTopUp;
        await this.agentsService.creditWallet(
          userId,
          amount,
          'Paystack wallet top-up',
        );
        this.logger.log(
          `Wallet top-up SUCCESS: userId=${userId} amount=${amount}`,
        );
      } else if (payment.orderId && payment.order) {
        await this.orders.updateStatus(
          payment.orderId,
          OrderStatus.PAYMENT_SUCCESS,
        );

        const order = payment.order;
        this.fulfillment.fulfill(order).catch((err: Error) => {
          this.logger.error(
            `Fulfillment trigger failed for order ${order.reference}: ${err.message}`,
          );
        });

        this.logger.log(`Payment SUCCESS for order ${order.reference}`);
      }
    } else if (status === 'failed' || status === 'abandoned') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          providerStatus: status,
          providerPayload: payload as unknown as Prisma.JsonObject,
          completedAt: new Date(),
        },
      });

      if (payment.orderId && payment.order) {
        await this.orders.updateStatus(
          payment.orderId,
          OrderStatus.PAYMENT_FAILED,
        );
        this.logger.warn(`Payment FAILED for order ${payment.order.reference}`);
      }
    }
  }
}
