import { Injectable, NotFoundException } from '@nestjs/common';
import { Bundle, Network } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { CreateBundleDto, UpdateBundleDto } from './dto/bundle.dto';

export { CreateBundleDto, UpdateBundleDto };

@Injectable()
export class BundlesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBundleDto): Promise<Bundle> {
    return this.prisma.bundle.create({
      data: {
        name: dto.name,
        description: dto.description,
        network: dto.network,
        dataMb: dto.dataMb,
        validityDays: dto.validityDays,
        costPrice: dto.costPrice,
        sellingPrice: dto.sellingPrice,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
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
