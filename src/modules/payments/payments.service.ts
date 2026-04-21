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
import { AgentsService } from '../agents/agents.service';

interface MoMoCallbackPayload extends Prisma.JsonObject {
  externalId: string;
  status: string;
  financialTransactionId?: string;
  reason?: string;
  walletTopUp?: { userId: string; amount: number };
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
    private readonly mtnMomo: MtnMomoProvider,
    @Inject(forwardRef(() => AgentsService))
    private readonly agentsService: AgentsService,
  ) {}

  async initiateMoMo(order: Order, payerPhone: string): Promise<void> {
    const result = await this.mtnMomo.initiate(
      { reference: order.reference, amount: order.amount },
      payerPhone,
    );

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

  async initiateWalletTopUp(
    userId: string,
    amount: number,
    payerPhone: string,
  ): Promise<{ providerRef: string }> {
    const result = await this.mtnMomo.initiate(
      { reference: `TOPUP-${userId}-${Date.now()}`, amount },
      payerPhone,
    );

    if (!result.success) {
      throw new Error(result.message ?? 'MoMo initiation failed');
    }

    await this.prisma.payment.create({
      data: {
        userId,
        provider: PaymentProvider.MTN_MOMO,
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
    return { providerRef: result.providerRef };
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

    const isWalletTopUp =
      !payment.orderId && isWalletTopUpPayload(payment.providerPayload);

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

      if (isWalletTopUp && isWalletTopUpPayload(payment.providerPayload)) {
        const { userId, amount } = payment.providerPayload.walletTopUp;
        await this.agentsService.creditWallet(
          userId,
          amount,
          'MoMo wallet top-up',
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
