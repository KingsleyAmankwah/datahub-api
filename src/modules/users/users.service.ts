import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findOrCreate(phoneNumber: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { phoneNumber },
    });
    if (existing) return existing;

    return this.prisma.user.create({
      data: { phoneNumber },
    });
  }

  async findByPhone(phoneNumber: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phoneNumber } });
  }
}
