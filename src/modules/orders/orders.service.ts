import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Network, Order, OrderStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from 'src/database/prisma.service';

export interface CreateOrderInput {
  userId: string;
  bundleId: string;
  recipientPhone: string;
  recipientNetwork: Network;
  ussdSessionId?: string;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateOrderInput): Promise<Order> {
    const bundle = await this.prisma.bundle.findUnique({
      where: { id: input.bundleId },
    });
    if (!bundle) throw new NotFoundException('Bundle not found');

    const reference = this.generateReference();

    const order = await this.prisma.order.create({
      data: {
        reference,
        userId: input.userId,
        bundleId: input.bundleId,
        recipientPhone: input.recipientPhone,
        recipientNetwork: input.recipientNetwork,
        amount: bundle.sellingPrice,
        status: OrderStatus.PENDING,
        ussdSessionId: input.ussdSessionId ?? null,
      },
    });

    await this.audit(order.id, input.userId, 'ORDER_CREATED', {
      reference,
      amount: bundle.sellingPrice,
      recipientPhone: input.recipientPhone,
    });

    this.logger.log(`Order created: ${reference}`);
    return order;
  }

  async updateStatus(
    orderId: string,
    status: OrderStatus,
    metadata?: Record<string, any>,
  ): Promise<Order> {
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { status },
    });
    await this.audit(orderId, order.userId, `ORDER_${status}`, metadata);
    return order;
  }

  async findById(id: string): Promise<Order | null> {
    return this.prisma.order.findUnique({
      where: { id },
      include: { bundle: true, payment: true, fulfillment: true },
    });
  }

  async findByReference(reference: string): Promise<Order | null> {
    return this.prisma.order.findUnique({ where: { reference } });
  }

  async findAll(page = 1, limit = 20, status?: OrderStatus) {
    const skip = (page - 1) * limit;
    const where = status ? { status } : {};

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          bundle: true,
          user: { select: { phoneNumber: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      orders,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  private generateReference(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomUUID().split('-')[0].toUpperCase();
    return `DH-${date}-${suffix}`;
  }

  async audit(
    orderId: string,
    userId: string,
    action: string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: { orderId, userId, action, metadata },
    });
  }
}
