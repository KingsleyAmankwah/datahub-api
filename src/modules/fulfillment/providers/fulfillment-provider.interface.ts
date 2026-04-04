import { Order } from '@prisma/client';

export interface FulfillmentResult {
  providerRef: string;
  success: boolean;
  providerStatus: string;
  message?: string;
}

export interface IFulfillmentProvider {
  readonly name: string;
  fulfill(order: Order): Promise<FulfillmentResult>;
  checkStatus(providerRef: string): Promise<{
    status: string;
    providerStatus: string;
  }>;
}
