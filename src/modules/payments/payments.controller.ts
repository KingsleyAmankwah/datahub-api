import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { createHmac } from 'crypto';
import type { Request } from 'express';

interface PaystackWebhookPayload extends Prisma.JsonObject {
  event: string;
  data: {
    reference: string;
    status: string;
    id: number;
    gateway_response: string;
  };
}

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Post('paystack/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Paystack payment webhook',
    description:
      'Called by Paystack after a payment is completed, failed, or abandoned.',
  })
  @ApiResponse({ status: 200, description: 'Webhook received' })
  async paystackWebhook(
    @Req() req: Request,
    @Headers('x-paystack-signature') signature: string,
    @Body() payload: PaystackWebhookPayload,
  ): Promise<{ received: boolean }> {
    const secret = this.config.get<string>('PAYSTACK_SECRET_KEY', '');
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

    if (!rawBody || !signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }

    const expected = createHmac('sha512', secret).update(rawBody).digest('hex');

    if (signature !== expected) {
      this.logger.warn('Paystack webhook: invalid signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.debug(`Paystack webhook received: ${payload.event}`);
    await this.paymentsService.handlePaystackWebhook(payload);
    return { received: true };
  }
}
