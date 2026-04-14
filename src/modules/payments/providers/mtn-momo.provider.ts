import { Injectable, Logger } from '@nestjs/common';
import {
  IPaymentProvider,
  PaymentInitiateResult,
  PaymentStatusResult,
} from './payment-provider.interface';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Order } from '@prisma/client';

interface MoMoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface MoMoStatusResponse {
  status: string;
  externalId: string;
  financialTransactionId?: string;
  reason?: string;
}

@Injectable()
export class MtnMomoProvider implements IPaymentProvider {
  readonly name = 'MTN_MOMO';
  private readonly logger = new Logger(MtnMomoProvider.name);
  private readonly http: AxiosInstance;
  private readonly subscriptionKey: string;
  private readonly apiUser: string;
  private readonly apiKey: string;
  private readonly targetEnv: string;
  private readonly callbackUrl: string;

  constructor(private readonly config: ConfigService) {
    this.subscriptionKey = config.get('MOMO_COLLECTION_SUBSCRIPTION_KEY', '');
    this.apiUser = config.get('MOMO_COLLECTION_API_USER', '');
    this.apiKey = config.get('MOMO_COLLECTION_API_KEY', '');
    this.targetEnv = config.get('MOMO_TARGET_ENVIRONMENT', 'sandbox');
    this.callbackUrl = config.get('MOMO_CALLBACK_URL', '');

    this.http = axios.create({
      baseURL: config.get(
        'MOMO_BASE_URL',
        'https://sandbox.momodeveloper.mtn.com',
      ),
      timeout: 15_000,
    });
  }

  private async getAccessToken(): Promise<string> {
    const credentials = Buffer.from(`${this.apiUser}:${this.apiKey}`).toString(
      'base64',
    );

    const { data } = await this.http.post<MoMoTokenResponse>(
      '/collection/token/',
      {},
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
        },
      },
    );

    return data.access_token;
  }

  async initiate(
    order: Order,
    payerPhone: string,
  ): Promise<PaymentInitiateResult> {
    const externalId = randomUUID();
    const amountGhs = (order.amount / 100).toFixed(2);
    const phone = payerPhone.replace('+', '');

    try {
      const token = await this.getAccessToken();

      await this.http.post(
        '/collection/v1_0/requesttopay',
        {
          amount: amountGhs,
          currency: 'GHS',
          externalId,
          payer: {
            partyIdType: 'MSISDN',
            partyId: phone,
          },
          payerMessage: `DataHub: Pay GH₵${amountGhs} for data bundle`,
          payeeNote: `Order: ${order.reference}`,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Reference-Id': externalId,
            'X-Target-Environment': this.targetEnv,
            'X-Callback-Url': this.callbackUrl,
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(
        `MoMo request-to-pay initiated: ref=${externalId} order=${order.reference}`,
      );

      return {
        providerRef: externalId,
        providerStatus: 'PENDING',
        success: true,
      };
    } catch (err: unknown) {
      const message =
        err instanceof AxiosError
          ? ((err.response?.data as { message?: string })?.message ??
            err.message)
          : 'Unknown error';

      this.logger.error(
        `MoMo initiate failed for order ${order.reference}: ${message}`,
      );

      return {
        providerRef: '',
        providerStatus: 'FAILED',
        success: false,
        message,
      };
    }
  }

  async checkStatus(providerRef: string): Promise<PaymentStatusResult> {
    try {
      const token = await this.getAccessToken();

      const { data } = await this.http.get<MoMoStatusResponse>(
        `/collection/v1_0/requesttopay/${providerRef}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Target-Environment': this.targetEnv,
            'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          },
        },
      );

      const statusMap: Record<string, PaymentStatusResult['status']> = {
        SUCCESSFUL: 'SUCCESS',
        PENDING: 'PENDING',
        FAILED: 'FAILED',
      };

      return {
        providerRef,
        status: statusMap[data.status] ?? 'PENDING',
        providerStatus: data.status,
        providerPayload: data,
      };
    } catch (err: unknown) {
      const message = err instanceof AxiosError ? err.message : 'Unknown error';
      this.logger.error(
        `MoMo status check failed: ${providerRef} — ${message}`,
      );
      return { providerRef, status: 'PENDING', providerStatus: 'UNKNOWN' };
    }
  }
}
