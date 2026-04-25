import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrderStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CreateOrderDto } from './dto/create-order.dto';
import { LookupOrderDto } from './dto/lookup-order.dto';
import { UsersService } from '../users/users.service';
import { PaymentsService } from '../payments/payments.service';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(
    private readonly ordersService: OrdersService,
    private readonly usersService: UsersService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Public order lookup by reference + phone' })
  @ApiResponse({ status: 200, description: 'Order found' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async lookup(@Body() dto: LookupOrderDto) {
    const order = await this.ordersService.lookupByPhone(
      dto.reference,
      dto.phone,
    );
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  @Post('lookup/audit')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Public order audit log lookup by reference + phone',
  })
  @ApiResponse({ status: 200, description: 'Audit log entries' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async lookupAudit(@Body() dto: LookupOrderDto) {
    const order = await this.ordersService.lookupByPhone(
      dto.reference,
      dto.phone,
    );
    if (!order) throw new NotFoundException('Order not found');
    return this.ordersService.findAuditLogs(order.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Create a new order and initiate Paystack payment' })
  @ApiResponse({
    status: 201,
    description: 'Order created and payment initiated',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Bundle not found' })
  async create(@Body() dto: CreateOrderDto) {
    const user = await this.usersService.findOrCreate(dto.buyerPhone);

    const bundle = await this.ordersService.findBundle(dto.bundleId);

    const order = await this.ordersService.create({
      userId: user.id,
      bundleId: dto.bundleId,
      recipientPhone: dto.recipientPhone,
      recipientNetwork: bundle.network,
    });

    try {
      await this.paymentsService.initiatePaystack(order, dto.buyerPhone);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Paystack initiation failed for order ${order.reference}: ${msg}`,
      );
      return {
        ...order,
        paymentError: 'Payment initiation failed. Please retry.',
      };
    }

    return order;
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List all orders (paginated)' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'status', enum: OrderStatus, required: false })
  @ApiResponse({ status: 200, description: 'Paginated order list' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: OrderStatus,
  ) {
    return this.ordersService.findAll(page, limit, status);
  }

  @Get(':id/status')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Public order status check by ID' })
  @ApiResponse({ status: 200, description: 'Order status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async getStatus(@Param('id', ParseUUIDPipe) id: string) {
    const order = await this.ordersService.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    return {
      id: order.id,
      reference: order.reference,
      status: order.status,
      amount: order.amount,
      recipientPhone: order.recipientPhone,
      recipientNetwork: order.recipientNetwork,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get single order by ID (admin)' })
  @ApiResponse({ status: 200, description: 'Order found' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findById(id);
  }

  @Get(':id/audit')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get audit log for an order' })
  @ApiResponse({ status: 200, description: 'Audit log entries' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  findAuditLogs(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findAuditLogs(id);
  }
}
