import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { PrismaService } from 'src/database/prisma.service';
import { SessionData, SessionState } from './session.types';

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private redis: Redis;
  private readonly ttl: number;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.ttl = this.config.get<number>('REDIS_TTL_SECONDS', 180);
  }

  onModuleInit() {
    this.redis = new Redis({
      host: this.config.get<string>('REDIS_HOST', 'localhost'),
      port: this.config.get<number>('REDIS_PORT', 6379),
      password: this.config.get<string>('REDIS_PASSWORD') || undefined,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });

    this.redis.on('connect', () => this.logger.log('Redis connected'));
    this.redis.on('error', (err) => this.logger.error('Redis error', err));
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  private key(sessionId: string): string {
    return `ussd:session:${sessionId}`;
  }
  async getOrCreate(
    sessionId: string,
    phoneNumber: string,
    serviceCode: string,
  ): Promise<SessionData> {
    const existing = await this.get(sessionId);
    if (existing) return existing;

    const now = new Date().toISOString();
    const session: SessionData = {
      sessionId,
      phoneNumber,
      serviceCode,
      state: SessionState.MAIN_MENU,
      interactions: [],
      createdAt: now,
      updatedAt: now,
    };

    await this.save(session);

    // Create record in DB immediately — live state stays in Redis
    await this.prisma.ussdSession.create({
      data: { sessionId, phoneNumber, serviceCode },
    });

    return session;
  }

  async get(sessionId: string): Promise<SessionData | null> {
    const raw = await this.redis.get(this.key(sessionId));
    if (!raw) return null;
    return JSON.parse(raw) as SessionData;
  }

  async save(session: SessionData): Promise<void> {
    session.updatedAt = new Date().toISOString();
    await this.redis.setex(
      this.key(session.sessionId),
      this.ttl,
      JSON.stringify(session),
    );
  }

  async addInteraction(
    session: SessionData,
    input: string,
    response: string,
  ): Promise<void> {
    session.interactions.push({
      input,
      response,
      timestamp: new Date().toISOString(),
    });
    await this.save(session);
  }

  async archive(session: SessionData): Promise<void> {
    await this.prisma.ussdSession.update({
      where: { sessionId: session.sessionId },
      data: {
        interactions: session.interactions,
        completedAt: new Date(),
      },
    });

    await this.redis.del(this.key(session.sessionId));
    this.logger.debug(`Session archived: ${session.sessionId}`);
  }

  async delete(sessionId: string): Promise<void> {
    await this.redis.del(this.key(sessionId));
  }
}
