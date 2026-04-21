import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AgentsService } from './agents.service';
import { ApplyAgentDto, TopUpWalletDto } from './dto/agents.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgentAuthGuard } from '../auth/agent-auth.guard';
import { AgentStatus, Network } from '@prisma/client';
import { IsEnum, IsString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentsService } from '../payments/payments.service';

class PlaceAgentOrderDto {
  @ApiProperty()
  @IsString()
  bundleId: string;

  @ApiProperty({ example: '0241234567' })
  @IsString()
  @Matches(/^(\+233|0)[2-9]\d{8}$/)
  recipientPhone: string;

  @ApiProperty({ enum: Network })
  @IsEnum(Network)
  recipientNetwork: Network;

  constructor(
    bundleId: string,
    recipientPhone: string,
    recipientNetwork: Network,
  ) {
    this.bundleId = bundleId;
    this.recipientPhone = recipientPhone;
    this.recipientNetwork = recipientNetwork;
  }
}

@ApiTags('Agents')
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly agents: AgentsService,
    private readonly payments: PaymentsService,
  ) {}

  @Post('apply')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit agent application' })
  apply(@Body() dto: ApplyAgentDto) {
    return this.agents.apply(dto);
  }

  @Get('profile')
  @UseGuards(AgentAuthGuard)
  @ApiOperation({ summary: 'Get agent profile' })
  getProfile(@Request() req: { user: { id: string } }) {
    return this.agents.getProfile(req.user.id);
  }

  @Get('orders')
  @UseGuards(AgentAuthGuard)
  @ApiOperation({ summary: 'Get agent orders' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getOrders(
    @Request() req: { user: { id: string } },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.agents.getOrders(req.user.id, page, limit);
  }

  @Post('wallet/topup')
  @UseGuards(AgentAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Initiate MoMo wallet top-up' })
  topUp(@Request() req: { user: { id: string } }, @Body() dto: TopUpWalletDto) {
    return this.payments.initiateWalletTopUp(
      req.user.id,
      dto.amount,
      dto.payerPhone,
    );
  }

  @Get('wallet/transactions')
  @UseGuards(AgentAuthGuard)
  @ApiOperation({ summary: 'Get wallet transaction history' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  getWalletTransactions(
    @Request() req: { user: { id: string } },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.agents.getWalletTransactions(req.user.id, page, limit);
  }

  @Post('orders')
  @UseGuards(AgentAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Place order as agent (deducts from wallet)' })
  placeOrder(
    @Request() req: { user: { id: string } },
    @Body() dto: PlaceAgentOrderDto,
  ) {
    return this.agents.placeOrder(
      req.user.id,
      dto.bundleId,
      dto.recipientPhone,
      dto.recipientNetwork,
    );
  }

  // Admin endpoints
  @Post('admin/:id/approve')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Approve agent' })
  approve(@Param('id', ParseUUIDPipe) id: string) {
    return this.agents.approve(id);
  }

  @Post('admin/:id/suspend')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Suspend agent' })
  suspend(@Param('id', ParseUUIDPipe) id: string) {
    return this.agents.suspend(id);
  }

  @Get('admin/list')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: '[Admin] List all agents' })
  @ApiQuery({ name: 'status', enum: AgentStatus, required: false })
  listAll(@Query('status') status?: AgentStatus) {
    return this.agents.listAll(status);
  }
}
