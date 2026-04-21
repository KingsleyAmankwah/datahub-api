export interface PaymentInitiateInput {
  reference: string;
  amount: number;
}

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
  providerPayload?: Record<string, unknown>;
}

export interface IPaymentProvider {
  readonly name: string;
  initiate(
    input: PaymentInitiateInput,
    payerPhone: string,
  ): Promise<PaymentInitiateResult>;
  checkStatus(providerRef: string): Promise<PaymentStatusResult>;
}
