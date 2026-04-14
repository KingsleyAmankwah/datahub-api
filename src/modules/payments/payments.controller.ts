import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { Prisma } from '@prisma/client';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

interface MoMoCallbackPayload extends Prisma.JsonObject {
  externalId: string;
  status: string;
  financialTransactionId?: string;
  reason?: string;
}

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('momo/callback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'MTN MoMo payment callback',
    description: 'Called by MTN MoMo after a payment is approved or rejected.',
  })
  @ApiResponse({ status: 200, description: 'Callback received' })
  async momoCallback(
    @Body() payload: MoMoCallbackPayload,
  ): Promise<{ received: boolean }> {
    this.logger.debug(`MoMo callback received: ${JSON.stringify(payload)}`);
    await this.paymentsService.handleMoMoCallback(payload);
    return { received: true };
  }
}
