import { Order } from '@prisma/client';

export interface PaymentInitiateResult {
  providerRef: string;
  providerStatus: string;
  success: boolean;
  message?: string;
}

export interface PaymentStatusResult {
  providerRef: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  providerStatus: string;
  providerPayload?: Record<string, any>;
}

export interface IPaymentProvider {
  readonly name: string;
  initiate(order: Order, payerPhone: string): Promise<PaymentInitiateResult>;
  checkStatus(providerRef: string): Promise<PaymentStatusResult>;
}
