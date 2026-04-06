import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { Order } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
import {
  IFulfillmentProvider,
  FulfillmentResult,
} from './fulfillment-provider.interface';

interface RemaDataPurchaseResponse {
  status: 'success' | 'error';
  message: string;
  data?: {
    reference: string;
    client_reference: string;
    status: 'pending' | 'completed' | 'failed' | 'refunded';
    amount: number;
    balance: string;
    provider: string;
    refunded?: boolean;
  };
}

interface RemaDataOrderStatusResponse {
  status: 'success' | 'error';
  data?: {
    status: 'pending' | 'completed' | 'failed' | 'refunded';
    reference: string;
  };
}

interface RemaDataBalanceResponse {
  status: 'success' | 'error';
  data?: {
    balance: string;
    currency: string;
  };
}

@Injectable()
export class RemaDataProvider implements IFulfillmentProvider {
  readonly name = 'REMADATA';
  private readonly logger = new Logger(RemaDataProvider.name);
  private readonly http: AxiosInstance;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.http = axios.create({
      baseURL: config.get('REMADATA_BASE_URL', 'https://remadata.com/api'),
      timeout: 30_000,
      headers: {
        'X-API-KEY': config.get<string>('REMADATA_API_KEY', ''),
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

    const networkMap: Record<string, string> = {
      MTN: 'mtn',
      TELECEL: 'telecel',
      AIRTELTIGO: 'airteltigo',
    };

    const networkType = networkMap[order.recipientNetwork];
    if (!networkType) {
      return {
        providerRef: '',
        success: false,
        providerStatus: 'UNSUPPORTED_NETWORK',
        message: `Network ${order.recipientNetwork} not supported`,
      };
    }

    const phone = order.recipientPhone.replace('+233', '0');

    try {
      const { data } = await this.http.post<RemaDataPurchaseResponse>(
        '/buy-data',
        {
          ref: order.reference,
          phone,
          volumeInMB: bundle.dataMb,
          networkType,
        },
      );

      if (data.status === 'success' && data.data) {
        this.logger.log(
          `RemaData order placed: ref=${data.data.reference} order=${order.reference} status=${data.data.status}`,
        );

        return {
          providerRef: data.data.reference,
          success: true,
          providerStatus: data.data.status.toUpperCase(),
          message: data.message,
        };
      }

      this.logger.error(
        `RemaData order failed: order=${order.reference} message=${data.message}`,
      );

      return {
        providerRef: '',
        success: false,
        providerStatus: 'FAILED',
        message: data.message,
      };
    } catch (err: unknown) {
      const message =
        err instanceof AxiosError
          ? ((err.response?.data as { message?: string })?.message ??
            err.message)
          : 'Unknown error';

      this.logger.error(
        `RemaData request failed: order=${order.reference} — ${message}`,
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
      const { data } = await this.http.get<RemaDataOrderStatusResponse>(
        `/order-status/${providerRef}`,
      );

      if (data.status === 'success' && data.data) {
        const providerStatus = data.data.status.toUpperCase();
        return {
          status: providerStatus === 'COMPLETED' ? 'SUCCESS' : providerStatus,
          providerStatus,
        };
      }

      return { status: 'UNKNOWN', providerStatus: 'UNKNOWN' };
    } catch (err: unknown) {
      const message = err instanceof AxiosError ? err.message : 'Unknown error';
      this.logger.error(
        `RemaData status check failed: ${providerRef} — ${message}`,
      );
      return { status: 'UNKNOWN', providerStatus: 'UNKNOWN' };
    }
  }

  async getWalletBalance(): Promise<number | null> {
    try {
      const { data } =
        await this.http.get<RemaDataBalanceResponse>('/wallet-balance');
      if (data.status === 'success' && data.data) {
        return parseFloat(data.data.balance);
      }
      return null;
    } catch {
      return null;
    }
  }
}
