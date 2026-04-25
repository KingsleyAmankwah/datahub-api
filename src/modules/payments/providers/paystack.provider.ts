import { Injectable, Logger } from '@nestjs/common';
import {
  IPaymentProvider,
  PaymentInitiateInput,
  PaymentInitiateResult,
  PaymentStatusResult,
} from './payment-provider.interface';
import axios, { AxiosInstance, AxiosError } from 'axios';
import { ConfigService } from '@nestjs/config';

interface PaystackInitResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    status: string; // 'success' | 'failed' | 'abandoned' | 'pending'
    reference: string;
    id: number;
    gateway_response: string;
  };
}

@Injectable()
export class PaystackProvider implements IPaymentProvider {
  readonly name = 'PAYSTACK';
  private readonly logger = new Logger(PaystackProvider.name);
  private readonly http: AxiosInstance;
  private readonly secretKey: string;

  constructor(private readonly config: ConfigService) {
    this.secretKey = config.get('PAYSTACK_SECRET_KEY', '');

    this.http = axios.create({
      baseURL: 'https://api.paystack.co',
      timeout: 15_000,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async initiate(
    input: PaymentInitiateInput,
    payerPhone: string,
  ): Promise<PaymentInitiateResult> {
    try {
      const { data } = await this.http.post<PaystackInitResponse>(
        '/transaction/initialize',
        {
          reference: input.reference,
          amount: input.amount, // already in pesewas/kobo
          currency: 'GHS',
          phone: payerPhone,
          channels: ['mobile_money'],
          metadata: { phone: payerPhone },
        },
      );

      this.logger.log(
        `Paystack transaction initialized: ref=${input.reference}`,
      );

      return {
        providerRef: data.data.reference,
        providerStatus: 'PENDING',
        success: true,
        message: data.data.authorization_url,
      };
    } catch (err: unknown) {
      const axiosErr = err instanceof AxiosError ? err : null;
      const message = axiosErr
        ? ((axiosErr.response?.data as { message?: string })?.message ??
          axiosErr.message)
        : 'Unknown error';

      this.logger.error(
        `Paystack initiate failed for ref ${input.reference}: ${message}`,
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
      const { data } = await this.http.get<PaystackVerifyResponse>(
        `/transaction/verify/${providerRef}`,
      );

      const statusMap: Record<string, PaymentStatusResult['status']> = {
        success: 'SUCCESS',
        failed: 'FAILED',
        abandoned: 'FAILED',
        pending: 'PENDING',
      };

      return {
        providerRef,
        status: statusMap[data.data.status] ?? 'PENDING',
        providerStatus: data.data.status,
        providerPayload: data.data as unknown as Record<string, unknown>,
      };
    } catch (err: unknown) {
      const message = err instanceof AxiosError ? err.message : 'Unknown error';
      this.logger.error(
        `Paystack status check failed: ${providerRef} — ${message}`,
      );
      return { providerRef, status: 'PENDING', providerStatus: 'UNKNOWN' };
    }
  }
}
