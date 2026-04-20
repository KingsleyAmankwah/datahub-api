import { Injectable, Logger } from '@nestjs/common';
import { Order } from '@prisma/client';
import {
  IFulfillmentProvider,
  FulfillmentResult,
} from './fulfillment-provider.interface';
import { randomUUID } from 'crypto';

@Injectable()
export class MockFulfillmentProvider implements IFulfillmentProvider {
  readonly name = 'MOCK';
  private readonly logger = new Logger(MockFulfillmentProvider.name);

  fulfill(order: Order): Promise<FulfillmentResult> {
    const providerRef = `MOCK-${randomUUID()}`;
    this.logger.log(
      `Mock fulfillment success: order=${order.reference} ref=${providerRef}`,
    );
    return Promise.resolve({
      providerRef,
      success: true,
      providerStatus: 'COMPLETED',
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async checkStatus(providerRef: string) {
    return Promise.resolve({ status: 'SUCCESS', providerStatus: 'COMPLETED' });
  }
}
