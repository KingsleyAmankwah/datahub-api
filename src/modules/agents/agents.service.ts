import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import {
  AgentStatus,
  OrderStatus,
  UserRole,
  WalletTransactionType,
  Network,
} from '@prisma/client';
import { ApplyAgentDto } from './dto/agents.dto';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async apply(dto: ApplyAgentDto) {
    const existing = await this.prisma.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
      include: { agent: true },
    });

    if (existing?.agent) {
      throw new ConflictException(
        'An agent account already exists for this phone number',
      );
    }

    const passwordHash = await bcrypt.hash(dto.pin, 10);

    const user = await this.prisma.user.upsert({
      where: { phoneNumber: dto.phoneNumber },
      update: { name: dto.name, role: UserRole.AGENT, passwordHash },
      create: {
        phoneNumber: dto.phoneNumber,
        name: dto.name,
        role: UserRole.AGENT,
        passwordHash,
      },
    });

    const agent = await this.prisma.agent.create({
      data: { userId: user.id, businessName: dto.businessName },
      include: { user: { select: { phoneNumber: true, name: true } } },
    });

    this.logger.log(
      `Agent application submitted: ${dto.businessName} (${dto.phoneNumber})`,
    );
    return agent;
  }

  async getProfile(userId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { userId },
      include: {
        user: {
          select: { phoneNumber: true, name: true, walletBalance: true },
        },
      },
    });
    if (!agent) throw new NotFoundException('Agent profile not found');
    return agent;
  }

  async getOrders(userId: string, page = 1, limit = 20) {
    const agent = await this.findActiveAgent(userId);
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { agentId: agent.id },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { bundle: true },
      }),
      this.prisma.order.count({ where: { agentId: agent.id } }),
    ]);

    return { orders, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getWalletTransactions(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.walletTransaction.count({ where: { userId } }),
    ]);

    return {
      transactions,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  // Called by PaymentsService after wallet top-up payment succeeds
  async creditWallet(userId: string, amount: number, description?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const [updatedUser] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { walletBalance: { increment: amount } },
      }),
      this.prisma.walletTransaction.create({
        data: {
          userId,
          type: WalletTransactionType.TOPUP,
          amount,
          balanceBefore: user.walletBalance,
          balanceAfter: user.walletBalance + amount,
          description: description ?? 'Wallet top-up',
        },
      }),
    ]);

    this.logger.log(
      `Wallet credited: userId=${userId} amount=${amount} newBalance=${updatedUser.walletBalance}`,
    );
    return updatedUser.walletBalance;
  }

  async deductWallet(
    userId: string,
    amount: number,
    orderId: string,
    description?: string,
  ) {
    const result = await this.prisma.$executeRaw`
      UPDATE "User"
      SET "walletBalance" = "walletBalance" - ${amount}
      WHERE id = ${userId}
        AND "walletBalance" >= ${amount}
    `;

    if (result === 0) {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');
      throw new BadRequestException(
        `Insufficient wallet balance. Available: GHS ${(user.walletBalance / 100).toFixed(2)}`,
      );
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    await this.prisma.walletTransaction.create({
      data: {
        userId,
        type: WalletTransactionType.DEDUCTION,
        amount,
        balanceBefore: user.walletBalance + amount,
        balanceAfter: user.walletBalance,
        description: description ?? 'Bundle order',
        orderId,
      },
    });

    this.logger.log(
      `Wallet deducted: userId=${userId} amount=${amount} orderId=${orderId}`,
    );
  }

  async placeOrder(
    userId: string,
    bundleId: string,
    recipientPhone: string,
    recipientNetwork: Network,
  ) {
    const agent = await this.findActiveAgent(userId);

    const bundle = await this.prisma.bundle.findUnique({
      where: { id: bundleId },
    });
    if (!bundle || !bundle.isActive)
      throw new NotFoundException('Bundle not found');

    const amount = bundle.costPrice;
    const reference = this.generateReference();

    // Single transaction: deduct wallet, create order, create wallet tx record
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.$executeRaw`
        UPDATE "User"
        SET "walletBalance" = "walletBalance" - ${amount}
        WHERE id = ${userId}
          AND "walletBalance" >= ${amount}
      `;

      if (result === 0) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
        throw new BadRequestException(
          `Insufficient wallet balance. Available: GHS ${(user.walletBalance / 100).toFixed(2)}`,
        );
      }

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });

      const order = await tx.order.create({
        data: {
          reference,
          userId,
          bundleId,
          recipientPhone,
          recipientNetwork,
          amount,
          status: OrderStatus.PAYMENT_SUCCESS,
          agentId: agent.id,
        },
      });

      await tx.walletTransaction.create({
        data: {
          userId,
          type: WalletTransactionType.DEDUCTION,
          amount,
          balanceBefore: user.walletBalance + amount,
          balanceAfter: user.walletBalance,
          description: `Order for ${recipientPhone}`,
          orderId: order.id,
        },
      });

      this.logger.log(
        `Agent order placed: ${reference} agent=${agent.businessName}`,
      );
      return order;
    });
  }

  // Admin methods
  async approve(agentId: string) {
    return this.prisma.agent.update({
      where: { id: agentId },
      data: { status: AgentStatus.ACTIVE },
    });
  }

  async suspend(agentId: string) {
    return this.prisma.agent.update({
      where: { id: agentId },
      data: { status: AgentStatus.SUSPENDED },
    });
  }

  async listAll(status?: AgentStatus) {
    return this.prisma.agent.findMany({
      where: status ? { status } : {},
      include: {
        user: {
          select: { phoneNumber: true, name: true, walletBalance: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findActiveAgent(userId: string) {
    const agent = await this.prisma.agent.findUnique({ where: { userId } });
    if (!agent) throw new NotFoundException('Agent profile not found');
    if (agent.status !== AgentStatus.ACTIVE) {
      throw new BadRequestException(
        `Agent account is ${agent.status.toLowerCase()}`,
      );
    }
    return agent;
  }

  private generateReference(): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomUUID().split('-')[0].toUpperCase();
    return `AG-${date}-${suffix}`;
  }
}
