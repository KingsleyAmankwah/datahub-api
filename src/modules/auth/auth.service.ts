import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { PrismaService } from 'src/database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class CreateAdminDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  name: string;
}

export interface AdminPayload {
  id: string;
  email: string;
  name: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; admin: AdminPayload }> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });

    if (!admin || !admin.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatch = await bcrypt.compare(
      dto.password,
      admin.passwordHash,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = { sub: admin.id, email: admin.email };
    const accessToken = this.jwt.sign(payload);

    this.logger.log(`Admin login: ${admin.email}`);

    return {
      accessToken,
      admin: { id: admin.id, email: admin.email, name: admin.name },
    };
  }

  async createAdmin(dto: CreateAdminDto): Promise<AdminPayload> {
    const existing = await this.prisma.adminUser.findUnique({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    const admin = await this.prisma.adminUser.create({
      data: { email: dto.email, name: dto.name, passwordHash },
    });

    this.logger.log(`Admin created: ${admin.email}`);
    return { id: admin.id, email: admin.email, name: admin.name };
  }
}
