export enum SessionState {
  MAIN_MENU = 'MAIN_MENU',
  SELECT_NETWORK = 'SELECT_NETWORK',
  SELECT_BUNDLE = 'SELECT_BUNDLE',
  CONFIRM_ORDER = 'CONFIRM_ORDER',
  AWAITING_PAYMENT = 'AWAITING_PAYMENT',
  ENTER_RECIPIENT = 'ENTER_RECIPIENT',
  SELECT_RECIPIENT_NETWORK = 'SELECT_RECIPIENT_NETWORK',
  SELECT_BUNDLE_FOR_RECIPIENT = 'SELECT_BUNDLE_FOR_RECIPIENT',
  CONFIRM_ORDER_FOR_RECIPIENT = 'CONFIRM_ORDER_FOR_RECIPIENT',
  ORDER_HISTORY = 'ORDER_HISTORY',
}

export interface SessionData {
  sessionId: string;
  phoneNumber: string;
  serviceCode: string;
  state: SessionState;

  // Accumulated across menu steps
  selectedNetwork?: string;
  selectedBundleId?: string;
  selectedBundleLabel?: string;
  selectedBundleAmount?: number;
  recipientPhone?: string;
  orderId?: string;

  // Full interaction log — archived to DB when session ends
  interactions: Array<{
    input: string;
    response: string;
    timestamp: string;
  }>;

  createdAt: string;
  updatedAt: string;
}
