import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Network, Order, OrderStatus, Prisma } from '@prisma/client';
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
    metadata?: Prisma.InputJsonValue,
  ): Promise<Order> {
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { status },
    });
    await this.audit(orderId, order.userId, `ORDER_${status}`, metadata);
    return order;
  }

  async findBundle(id: string) {
    const bundle = await this.prisma.bundle.findUnique({ where: { id } });
    if (!bundle) throw new NotFoundException('Bundle not found');
    return bundle;
  }

  async findById(id: string): Promise<Order | null> {
    return this.prisma.order.findUnique({
      where: { id },
      include: {
        bundle: true,
        payment: true,
        fulfillment: true,
        user: { select: { id: true, phoneNumber: true, name: true } },
      },
    });
  }

  async findByReference(reference: string): Promise<Order | null> {
    return this.prisma.order.findUnique({ where: { reference } });
  }

  // Single query: fetch order with user phone, verify ownership in memory
  async lookupByPhone(reference: string, phone: string) {
    const order = await this.prisma.order.findUnique({
      where: { reference },
      select: {
        id: true,
        reference: true,
        recipientPhone: true,
        recipientNetwork: true,
        amount: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { phoneNumber: true } },
        bundle: {
          select: {
            name: true,
            network: true,
            type: true,
            dataMb: true,
            validityDays: true,
            sellingPrice: true,
          },
        },
        payment: { select: { provider: true, status: true, amount: true } },
        fulfillment: { select: { status: true, completedAt: true } },
      },
    });

    if (!order || order.user.phoneNumber !== phone) return null;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { user: _user, ...result } = order;
    return result;
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
    return `BB-${date}-${suffix}`;
  }

  private async audit(
    orderId: string,
    userId: string,
    action: string,
    metadata?: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: { orderId, userId, action, metadata },
    });
  }

  async findAuditLogs(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) throw new NotFoundException(`Order ${orderId} not found`);

    return this.prisma.auditLog.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        action: true,
        metadata: true,
        createdAt: true,
      },
    });
  }
}
