import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Request } from 'express';

@Injectable()
export class UssdSignatureGuard implements CanActivate {
  private readonly logger = new Logger(UssdSignatureGuard.name);
  private readonly secret: string;
  private readonly nodeEnv: string;

  constructor(private readonly config: ConfigService) {
    this.secret = config.get<string>('ARKESEL_USSD_WEBHOOK_SECRET', '');
    this.nodeEnv = config.get<string>('NODE_ENV', 'development');
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.secret) {
      if (this.nodeEnv !== 'production') {
        this.logger.warn(
          'ARKESEL_USSD_WEBHOOK_SECRET not set — skipping signature check in development',
        );
        return true;
      }
      throw new UnauthorizedException('USSD webhook secret not configured');
    }

    const request = context.switchToHttp().getRequest<Request>();
    const signature = request.headers['x-arkesel-signature'] as string;

    if (!signature) {
      this.logger.warn('USSD request missing x-arkesel-signature header');
      throw new UnauthorizedException('Missing signature');
    }

    const body = JSON.stringify(request.body);
    const expected = crypto
      .createHmac('sha256', this.secret)
      .update(body)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    try {
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected),
      );

      if (!isValid) {
        this.logger.warn(
          'USSD request signature mismatch — possible spoofed request',
        );
        throw new UnauthorizedException('Invalid signature');
      }
    } catch {
      throw new UnauthorizedException('Invalid signature');
    }

    return true;
  }
}
