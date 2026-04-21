import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsInt,
  Min,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';

export class ApplyAgentDto {
  @ApiProperty({ example: 'Kofi Data Hub' })
  @IsString()
  businessName: string;

  @ApiProperty({ example: '+233241234567' })
  @IsString()
  @Matches(/^(\+233|0)[2-9]\d{8}$/, {
    message: 'phoneNumber must be a valid Ghana phone number',
  })
  phoneNumber: string;

  @ApiProperty({ example: 'Kofi Mensah' })
  @IsString()
  name: string;

  @ApiProperty({ example: '1234', description: '4 to 6 digit PIN' })
  @IsString()
  @MinLength(4)
  @MaxLength(6)
  pin: string;

  constructor(
    businessName: string,
    phoneNumber: string,
    name: string,
    pin: string,
  ) {
    this.businessName = businessName;
    this.phoneNumber = phoneNumber;
    this.name = name;
    this.pin = pin;
  }
}

export class TopUpWalletDto {
  @ApiProperty({
    example: 5000,
    description: 'Amount in pesewas (5000 = GHS 50)',
  })
  @IsInt()
  @Min(1000)
  amount: number;

  @ApiProperty({ example: '+233241234567' })
  @IsString()
  @Matches(/^(\+233|0)[2-9]\d{8}$/, {
    message: 'payerPhone must be a valid Ghana phone number',
  })
  payerPhone: string;

  constructor(amount: number, payerPhone: string) {
    this.amount = amount;
    this.payerPhone = payerPhone;
  }
}
