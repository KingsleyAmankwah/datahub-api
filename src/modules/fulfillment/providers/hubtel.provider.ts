import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { Order } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  IFulfillmentProvider,
  FulfillmentResult,
} from './fulfillment-provider.interface';

interface HubtelResponse {
  responseCode: string;
  transactionId?: string;
  status?: string;
  message?: string;
}

interface HubtelStatusResponse {
  status: string;
}

@Injectable()
export class HubtelProvider implements IFulfillmentProvider {
  readonly name = 'HUBTEL';
  private readonly logger = new Logger(HubtelProvider.name);
  private readonly http: AxiosInstance;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const clientId = config.get<string>('HUBTEL_CLIENT_ID', '');
    const clientSecret = config.get<string>('HUBTEL_CLIENT_SECRET', '');
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
      'base64',
    );

    this.http = axios.create({
      baseURL: config.get('HUBTEL_BASE_URL', 'https://api.hubtel.com'),
      timeout: 20_000,
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async fulfill(order: Order): Promise<FulfillmentResult> {
    const bundle = await this.prisma.bundle.findUnique({
      where: { id: order.bundleId },
    });

    if (!bundle) {
      return {
        providerRef: '',
        success: false,
        providerStatus: 'BUNDLE_NOT_FOUND',
        message: `Bundle ${order.bundleId} not found`,
      };
    }

    const phone = order.recipientPhone.replace('+233', '0');

    try {
      const { data } = await this.http.post<HubtelResponse>('/v1/data/topup', {
        recipientNumber: phone,
        network: order.recipientNetwork,
        dataCode: bundle.name,
        orderReference: order.reference,
        amount: (order.amount / 100).toFixed(2),
      });

      const success = data.responseCode === '0000';

      this.logger.log(
        `Hubtel fulfill ${success ? 'SUCCESS' : 'FAILED'}: order=${order.reference}`,
      );

      return {
        providerRef: data.transactionId ?? '',
        success,
        providerStatus: data.status ?? 'UNKNOWN',
        message: data.message,
      };
    } catch (err: unknown) {
      const message =
        err instanceof AxiosError
          ? ((err.response?.data as { message?: string })?.message ??
            err.message)
          : 'Unknown error';

      this.logger.error(
        `Hubtel fulfill failed: order=${order.reference} — ${message}`,
      );

      return {
        providerRef: '',
        success: false,
        providerStatus: 'ERROR',
        message,
      };
    }
  }

  async checkStatus(
    providerRef: string,
  ): Promise<{ status: string; providerStatus: string }> {
    try {
      const { data } = await this.http.get<HubtelStatusResponse>(
        `/v1/data/topup/${providerRef}`,
      );
      return {
        status: data.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING',
        providerStatus: data.status,
      };
    } catch {
      return { status: 'UNKNOWN', providerStatus: 'UNKNOWN' };
    }
  }
}
