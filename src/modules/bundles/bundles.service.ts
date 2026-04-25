import { Injectable, NotFoundException } from '@nestjs/common';
import { Bundle, Network } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PrismaService } from 'src/database/prisma.service';

export class CreateBundleDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsEnum(Network) network: Network;
  @IsInt() @Min(1) dataMb: number;
  @IsInt() @Min(1) validityDays: number;
  @IsInt() @Min(1) costPrice: number;
  @IsInt() @Min(1) sellingPrice: number;
  @IsOptional() @IsInt() sortOrder?: number;

  constructor(
    name: string,
    network: Network,
    dataMb: number,
    validityDays: number,
    costPrice: number,
    sellingPrice: number,
    description?: string,
    sortOrder?: number,
  ) {
    this.name = name;
    this.network = network;
    this.dataMb = dataMb;
    this.validityDays = validityDays;
    this.costPrice = costPrice;
    this.sellingPrice = sellingPrice;
    this.description = description;
    this.sortOrder = sortOrder;
  }
}

export class UpdateBundleDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(1) sellingPrice?: number;
  @IsOptional() @IsInt() @Min(1) costPrice?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

@Injectable()
export class BundlesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBundleDto): Promise<Bundle> {
    return this.prisma.bundle.create({ data: dto });
  }

  async findAll(network?: Network): Promise<Bundle[]> {
    return this.prisma.bundle.findMany({
      where: {
        isActive: true,
        ...(network && { network }),
      },
      orderBy: [{ network: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async findById(id: string): Promise<Bundle> {
    const bundle = await this.prisma.bundle.findUnique({ where: { id } });
    if (!bundle) throw new NotFoundException(`Bundle ${id} not found`);
    return bundle;
  }

  async update(id: string, dto: UpdateBundleDto): Promise<Bundle> {
    await this.findById(id);
    return this.prisma.bundle.update({ where: { id }, data: dto });
  }

  async deactivate(id: string): Promise<Bundle> {
    await this.findById(id);
    return this.prisma.bundle.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
