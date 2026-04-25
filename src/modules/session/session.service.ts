import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/database/prisma.service';
import { SessionData, SessionState } from './session.types';

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SessionService.name);
  private readonly store = new Map<
    string,
    { data: SessionData; expiresAt: number }
  >();
  private readonly ttlMs: number;
  private cleanupInterval!: ReturnType<typeof setInterval>;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.ttlMs = this.config.get<number>('SESSION_TTL_SECONDS', 180) * 1000;
  }

  onModuleInit() {
    // Purge expired sessions every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store.entries()) {
        if (entry.expiresAt < now) this.store.delete(key);
      }
    }, 60_000);

    this.logger.log('Session store ready (in-memory)');
  }

  onModuleDestroy() {
    clearInterval(this.cleanupInterval);
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

    await this.prisma.ussdSession.create({
      data: { sessionId, phoneNumber, serviceCode },
    });

    return session;
  }

  get(sessionId: string): Promise<SessionData | null> {
    const entry = this.store.get(this.key(sessionId));
    if (!entry || entry.expiresAt < Date.now()) {
      this.store.delete(this.key(sessionId));
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.data);
  }

  save(session: SessionData): Promise<void> {
    session.updatedAt = new Date().toISOString();
    this.store.set(this.key(session.sessionId), {
      data: session,
      expiresAt: Date.now() + this.ttlMs,
    });
    return Promise.resolve();
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

    this.store.delete(this.key(session.sessionId));
    this.logger.debug(`Session archived: ${session.sessionId}`);
  }

  delete(sessionId: string): Promise<void> {
    this.store.delete(this.key(sessionId));
    return Promise.resolve();
  }
}
