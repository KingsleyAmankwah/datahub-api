import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class LookupOrderDto {
  @ApiProperty({ example: 'DH-20240101-XXXX' })
  @IsString()
  @IsNotEmpty()
  reference: string;

  @ApiProperty({ example: '0241234567' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  constructor(reference: string, phone: string) {
    this.reference = reference;
    this.phone = phone;
  }
}
