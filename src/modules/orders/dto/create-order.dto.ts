import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

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

  @ApiProperty({
    example: '+233241234567',
    description: 'Phone number to charge via MoMo',
  })
  @IsString()
  @Matches(/^(\+233|0)[2-9]\d{8}$/, {
    message: 'buyerPhone must be a valid Ghana phone number',
  })
  buyerPhone: string;

  constructor(bundleId: string, recipientPhone: string, buyerPhone: string) {
    this.bundleId = bundleId;
    this.recipientPhone = recipientPhone;
    this.buyerPhone = buyerPhone;
  }
}
