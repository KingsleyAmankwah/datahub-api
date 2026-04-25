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
import { IsEnum, IsString } from 'class-validator';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from './payments.service';
import { PrismaService } from 'src/database/prisma.service';
import { DevOnlyGuard } from 'src/common/guards/dev-only.guard';
import { PaystackProvider } from './providers/paystack.provider';
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
    description: 'Phone Paystack will charge (auto-creates user if new)',
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
    description: 'providerRef / reference returned from /dev/payment/initiate',
  })
  @IsString()
  reference: string;

  @ApiProperty({ enum: ['success', 'failed'], example: 'success' })
  @IsString()
  status: 'success' | 'failed';

  constructor(reference: string, status: 'success' | 'failed') {
    this.reference = reference;
    this.status = status;
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
    private readonly paystack: PaystackProvider,
    private readonly users: UsersService,
  ) {}

  @Post('initiate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '[DEV] Create order & initiate Paystack payment',
    description:
      'Creates a fresh order from the given bundle, then calls PaystackProvider.initiate(). ' +
      'Returns the order, providerRef, and authorizationUrl needed for subsequent steps.',
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

    const { authorizationUrl } = await this.payments.initiatePaystack(
      order,
      dto.payerPhone,
    );

    const updated = await this.orders.findById(order.id);

    return {
      message: 'Order created and Paystack payment initiated',
      authorizationUrl,
      order: updated,
    };
  }

  @Post('simulate-callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[DEV] Simulate Paystack webhook (success or failed)',
    description:
      'Posts a fake Paystack webhook payload into PaymentsService.handlePaystackWebhook(). ' +
      'Use the reference / providerRef from the initiate response.',
  })
  @ApiBody({ type: SimulateCallbackDto })
  async simulateCallback(@Body() dto: SimulateCallbackDto) {
    await this.payments.handlePaystackWebhook({
      event: 'charge.success',
      data: {
        reference: dto.reference,
        status: dto.status,
        id: 0,
        gateway_response: 'Simulated',
      },
    });

    const payment = await this.prisma.payment.findFirst({
      where: { providerRef: dto.reference },
      include: { order: true },
    });

    return {
      message: `Webhook simulated with status=${dto.status}`,
      payment,
    };
  }

  @Get('status/:providerRef')
  @ApiOperation({
    summary: '[DEV] Verify Paystack transaction status',
    description:
      'Calls PaystackProvider.checkStatus() directly against the Paystack API.',
  })
  @ApiResponse({ status: 200, description: 'Live status from Paystack' })
  async checkStatus(@Param('providerRef') providerRef: string) {
    const [liveStatus, payment] = await Promise.all([
      this.paystack.checkStatus(providerRef),
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
