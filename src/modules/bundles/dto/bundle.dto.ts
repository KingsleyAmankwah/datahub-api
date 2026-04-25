import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Network } from '@prisma/client';

export class CreateBundleDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: Network }) @IsEnum(Network) network: Network;
  @ApiProperty() @IsInt() @Min(1) dataMb: number;
  @ApiProperty() @IsInt() @Min(1) validityDays: number;
  @ApiProperty() @IsInt() @Min(1) costPrice: number;
  @ApiProperty() @IsInt() @Min(1) sellingPrice: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;

  constructor(
    name: string,
    network: Network,
    dataMb: number,
    validityDays: number,
    costPrice: number,
    sellingPrice: number,
  ) {
    this.name = name;
    this.network = network;
    this.dataMb = dataMb;
    this.validityDays = validityDays;
    this.costPrice = costPrice;
    this.sellingPrice = sellingPrice;
  }
}

export class UpdateBundleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) sellingPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) costPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}
