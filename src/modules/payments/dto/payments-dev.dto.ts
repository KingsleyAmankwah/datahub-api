import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';
import { Network } from '@prisma/client';

export class InitiatePaymentDto {
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

export class SimulateCallbackDto {
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
