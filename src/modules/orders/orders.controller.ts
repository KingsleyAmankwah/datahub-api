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
  constructor(
    private readonly ordersService: OrdersService,
    private readonly usersService: UsersService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new order and initiate MoMo payment' })
  @ApiResponse({
    status: 201,
    description: 'Order created and payment initiated',
  })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Bundle not found' })
  async create(@Body() dto: CreateOrderDto) {
    const user = await this.usersService.findOrCreate(dto.payerPhone);

    const order = await this.ordersService.create({
      userId: user.id,
      bundleId: dto.bundleId,
      recipientPhone: dto.recipientPhone,
      recipientNetwork: dto.recipientNetwork,
    });

    this.paymentsService.initiateMoMo(order, dto.payerPhone).catch(() => {});

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

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get single order by ID' })
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
