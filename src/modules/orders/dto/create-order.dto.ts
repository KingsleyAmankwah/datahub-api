import { ApiProperty } from '@nestjs/swagger';
import { Network } from '@prisma/client';
import { IsEnum, IsString, Matches } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ example: 'uuid-of-bundle' })
  @IsString()
  bundleId: string;

  @ApiProperty({ example: '+233241234567' })
  @IsString()
  @Matches(/^(\+233|0)[2-9]\d{8}$/, {
    message: 'recipientPhone must be a valid Ghana phone number',
  })
  recipientPhone: string;

  @ApiProperty({ enum: Network })
  @IsEnum(Network)
  recipientNetwork: Network;

  @ApiProperty({
    example: '+233241234567',
    description: 'Phone number to charge via MoMo',
  })
  @IsString()
  @Matches(/^(\+233|0)[2-9]\d{8}$/, {
    message: 'payerPhone must be a valid Ghana phone number',
  })
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
