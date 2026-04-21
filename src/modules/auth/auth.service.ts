import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { IsEmail, IsString, MinLength, Matches } from 'class-validator';
import { PrismaService } from 'src/database/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

export interface AdminPayload {
  id: string;
  email: string;
  name: string;
}

export class AgentLoginDto {
  @IsString()
  @Matches(/^(\+233|0)[2-9]\d{8}$/, { message: 'Invalid Ghana phone number' })
  phoneNumber: string;

  @IsString()
  @MinLength(4)
  pin: string;

  constructor(phoneNumber: string, pin: string) {
    this.phoneNumber = phoneNumber;
    this.pin = pin;
  }
}
export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  constructor(email: string, password: string) {
    this.email = email;
    this.password = password;
  }
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

  constructor(name: string, email: string, password: string) {
    this.email = email;
    this.password = password;
    this.name = name;
  }
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 12;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async agentLogin(dto: AgentLoginDto): Promise<{
    accessToken: string;
    agent: { id: string; phoneNumber: string; name: string | null };
  }> {
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: dto.phoneNumber },
      include: { agent: true },
    });

    if (!user || !user.isActive || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.agent) {
      throw new UnauthorizedException('No agent account found for this number');
    }

    const pinMatch = await bcrypt.compare(dto.pin, user.passwordHash);
    if (!pinMatch) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: user.id, role: 'AGENT' };
    const accessToken = this.jwt.sign(payload);

    this.logger.log(`Agent login: ${user.phoneNumber}`);
    return {
      accessToken,
      agent: { id: user.id, phoneNumber: user.phoneNumber, name: user.name },
    };
  }

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
