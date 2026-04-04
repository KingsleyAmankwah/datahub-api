import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Order } from '@prisma/client';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { PrismaService } from 'src/database/prisma.service';

interface GiantSmsResponse {
  status: boolean;
  message: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly http: AxiosInstance;
  private readonly senderId: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const token = config.get<string>('GIANT_SMS_TOKEN', '');

    this.senderId = config.get('GIANT_SMS_SENDER_ID', 'DataHub');

    this.http = axios.create({
      baseURL: config.get<string>(
        'GIANT_SMS_BASE_URL',
        'https://api.giantsms.com/api/v1',
      ),
      timeout: 10_000,
      headers: {
        Authorization: `Basic ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async sendFulfillmentSuccess(order: Order): Promise<void> {
    const bundle = await this.prisma.bundle.findUnique({
      where: { id: order.bundleId },
    });

    if (!bundle) return;

    const size =
      bundle.dataMb! >= 1024
        ? `${(bundle.dataMb! / 1024).toFixed(0)}GB`
        : `${bundle.dataMb}MB`;

    const price = (order.amount / 100).toFixed(2);

    const buyerPhone = await this.getPhoneByUserId(order.userId);
    const isSelf = order.recipientPhone === buyerPhone;

    const message = isSelf
      ? `DataHub: Your ${size} data bundle has been activated. Ref: ${order.reference}. Thank you!`
      : `DataHub: ${size} data sent to ${order.recipientPhone}. Ref: ${order.reference}. GH₵${price} charged. Thank you!`;

    await this.sendSms(buyerPhone, message);
  }

  async sendFulfillmentFailed(order: Order): Promise<void> {
    const buyerPhone = await this.getPhoneByUserId(order.userId);
    const message =
      `DataHub: Sorry, order ${order.reference} could not be fulfilled. ` +
      `Our team is on it. You will be refunded within 24hrs. Call 0XXXXXXXX for help.`;

    await this.sendSms(buyerPhone, message);
  }

  async sendPaymentFailed(userId: string, reference: string): Promise<void> {
    const buyerPhone = await this.getPhoneByUserId(userId);
    const message =
      `DataHub: Payment for order ${reference} was not completed. ` +
      `Please try again or call 0XXXXXXXX for support.`;

    await this.sendSms(buyerPhone, message);
  }

  // ── Core sender ────────────────────────────────────────────────────────────
  private async sendSms(phone: string, message: string): Promise<void> {
    if (!phone) {
      this.logger.warn('sendSms called with empty phone number — skipping');
      return;
    }

    // Giant SMS expects local format: 024XXXXXXX not +233XXXXXXX
    const localPhone = phone.startsWith('+233') ? '0' + phone.slice(4) : phone;

    try {
      const { data } = await this.http.post<GiantSmsResponse>('/send', {
        from: this.senderId,
        recipients: [localPhone],
        msg: message,
      });

      if (data.status) {
        this.logger.log(`SMS sent to ${localPhone}`);
      } else {
        this.logger.warn(
          `SMS delivery issue for ${localPhone}: ${data.message}`,
        );
      }
    } catch (err: unknown) {
      // SMS failure must NEVER crash the main flow — just log it
      const message = err instanceof AxiosError ? err.message : 'Unknown error';
      this.logger.error(`SMS failed to ${localPhone}: ${message}`);
    }
  }

  private async getPhoneByUserId(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { phoneNumber: true },
    });
    return user?.phoneNumber ?? '';
  }

  async sendTest(phone: string): Promise<void> {
    await this.sendSms(
      phone,
      'DataHub: Test message. Your SMS integration is working!',
    );
  }
}
