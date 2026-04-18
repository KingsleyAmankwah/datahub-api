import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiTags,
  ApiBody,
  ApiResponse,
  ApiProperty,
} from '@nestjs/swagger';
import { Network } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from './payments.service';
import { PrismaService } from 'src/database/prisma.service';
import { DevOnlyGuard } from 'src/common/guards/dev-only.guard';
import { MtnMomoProvider } from './providers/mtn-momo.provider';
import { UsersService } from '../users/users.service';

class InitiatePaymentDto {
  @ApiProperty({ example: 'f577e8ab-8b2f-4656-bb7a-a06a6b7e654a' })
  @IsString()
  bundleId: string;

  @ApiProperty({ example: '+233241234567' })
  @IsString()
  recipientPhone: string;

  @ApiProperty({ enum: Network, example: Network.MTN })
  @IsEnum(Network)
  recipientNetwork: Network;

  @ApiProperty({
    example: '+233538558959',
    description: 'Phone MoMo will charge (auto-creates user if new)',
  })
  @IsString()
  payerPhone: string;

  constructor(
    bundleId: string,
    recipientPhone: string,
    recipientNetwork: Network,
    payerPhone: string,
  ) {
    this.bundleId = bundleId;
    this.recipientPhone = recipientPhone;
    this.recipientNetwork = recipientNetwork;
    this.payerPhone = payerPhone;
  }
}

class SimulateCallbackDto {
  @ApiProperty({
    description: 'providerRef returned from /dev/payment/initiate',
  })
  @IsString()
  externalId: string;

  @ApiProperty({ enum: ['SUCCESSFUL', 'FAILED'], example: 'SUCCESSFUL' })
  @IsString()
  status: 'SUCCESSFUL' | 'FAILED';

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  financialTransactionId?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  reason?: string;

  constructor(
    externalId: string,
    status: 'SUCCESSFUL' | 'FAILED',
    financialTransactionId?: string,
    reason?: string,
  ) {
    this.externalId = externalId;
    this.status = status;
    this.financialTransactionId = financialTransactionId;
    this.reason = reason;
  }
}

@ApiTags('Dev Payment Testing')
@Controller('dev/payment')
@UseGuards(DevOnlyGuard)
export class DevPaymentTestController {
  private readonly logger = new Logger(DevPaymentTestController.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
    private readonly mtnMomo: MtnMomoProvider,
    private readonly users: UsersService,
  ) {}

  @Post('initiate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '[DEV] Create order & initiate MoMo payment',
    description:
      'Creates a fresh order from the given bundle, then calls MtnMomoProvider.initiate(). ' +
      'Returns the order and providerRef needed for subsequent steps.',
  })
  @ApiBody({ type: InitiatePaymentDto })
  async initiateFullFlow(@Body() dto: InitiatePaymentDto) {
    const user = await this.users.findOrCreate(dto.payerPhone);

    const order = await this.orders.create({
      userId: user.id,
      bundleId: dto.bundleId,
      recipientPhone: dto.recipientPhone,
      recipientNetwork: dto.recipientNetwork,
    });

    this.logger.log(`[DEV] Order created: ${order.reference}`);

    await this.payments.initiateMoMo(order, dto.payerPhone);

    const updated = await this.orders.findById(order.id);

    return {
      message: 'Order created and MoMo payment initiated',
      order: updated,
    };
  }

  @Post('simulate-callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[DEV] Simulate MoMo callback (SUCCESSFUL or FAILED)',
    description:
      'Posts a fake MoMo callback payload directly into PaymentsService.handleMoMoCallback(). ' +
      'Use the externalId / providerRef from the initiate response.',
  })
  @ApiBody({ type: SimulateCallbackDto })
  async simulateCallback(@Body() dto: SimulateCallbackDto) {
    await this.payments.handleMoMoCallback({
      externalId: dto.externalId,
      status: dto.status,
      financialTransactionId: dto.financialTransactionId ?? `SIM-${Date.now()}`,
      reason: dto.reason,
    });

    const payment = await this.prisma.payment.findFirst({
      where: { providerRef: dto.externalId },
      include: { order: true },
    });

    return {
      message: `Callback simulated with status=${dto.status}`,
      payment,
    };
  }

  @Get('status/:providerRef')
  @ApiOperation({
    summary: '[DEV] Poll MoMo sandbox for payment status',
    description:
      'Calls MtnMomoProvider.checkStatus() directly against the sandbox API.',
  })
  @ApiResponse({ status: 200, description: 'Live status from MTN MoMo' })
  async checkStatus(@Param('providerRef') providerRef: string) {
    const [liveStatus, payment] = await Promise.all([
      this.mtnMomo.checkStatus(providerRef),
      this.prisma.payment.findFirst({
        where: { providerRef },
        include: { order: true },
      }),
    ]);

    return { liveStatus, payment };
  }

  @Get('order/:id')
  @ApiOperation({
    summary: '[DEV] Full order snapshot (payment, fulfillment, audit)',
  })
  async getOrderSnapshot(@Param('id', ParseUUIDPipe) id: string) {
    const order = await this.orders.findById(id);
    const audit = await this.orders.findAuditLogs(id);
    return { order, audit };
  }

  @Get('bundles')
  @ApiOperation({ summary: '[DEV] List all bundles (for picking a bundleId)' })
  async listBundles() {
    return this.prisma.bundle.findMany({
      take: 50,
      orderBy: { createdAt: 'desc' },
    });
  }
}
