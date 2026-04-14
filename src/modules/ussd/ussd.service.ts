import { Injectable, Logger } from '@nestjs/common';
import { SessionService } from '../session/session.service';
import { UssdMenuService } from './menus/ussd-menu.service';
import { UsersService } from '../users/users.service';
import { UssdPayloadDto, UssdType } from './dto/ussd-payload.dto';
import { SessionData, SessionState } from '../session/session.types';
import { Network } from '@prisma/client';
import { PaymentsService } from '../payments/payments.service';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class UssdService {
  private readonly logger = new Logger(UssdService.name);

  constructor(
    private readonly sessions: SessionService,
    private readonly menu: UssdMenuService,
    private readonly users: UsersService,
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  async handle(payload: UssdPayloadDto): Promise<string> {
    const { SessionId, PhoneNumber, ServiceCode, Type, Message } = payload;

    if (Type === UssdType.RELEASE || Type === UssdType.TIMEOUT) {
      const session = await this.sessions.get(SessionId);
      if (session) await this.sessions.archive(session);
      return 'END';
    }

    try {
      const session = await this.sessions.getOrCreate(
        SessionId,
        PhoneNumber,
        ServiceCode,
      );

      // Ensure user record exists
      await this.users.findOrCreate(PhoneNumber);

      const response = await this.dispatch(session, Message.trim(), Type);

      await this.sessions.addInteraction(session, Message, response);

      // Archive if session is ending
      if (response.startsWith('END')) {
        await this.sessions.archive(session);
      }

      return response;
    } catch (err) {
      this.logger.error(`USSD error for session ${SessionId}`, err);
      return this.menu.error();
    }
  }

  private async dispatch(
    session: SessionData,
    input: string,
    type: UssdType,
  ): Promise<string> {
    // Always show main menu on fresh dial
    if (type === UssdType.INITIATION) {
      session.state = SessionState.MAIN_MENU;
      await this.sessions.save(session);
      return this.menu.mainMenu();
    }

    // Global navigation
    if (input === '0' || input === '#') {
      return this.goHome(session);
    }

    switch (session.state) {
      case SessionState.MAIN_MENU:
        return this.handleMainMenu(session, input);

      case SessionState.SELECT_NETWORK:
        return this.handleSelectNetwork(session, input);

      case SessionState.SELECT_BUNDLE:
        return this.handleSelectBundle(session, input);

      case SessionState.CONFIRM_ORDER:
        return this.handleConfirmOrder(session, input);

      case SessionState.ENTER_RECIPIENT:
        return this.handleEnterRecipient(session, input);

      case SessionState.SELECT_RECIPIENT_NETWORK:
        return this.handleSelectRecipientNetwork(session, input);

      case SessionState.SELECT_BUNDLE_FOR_RECIPIENT:
        return this.handleSelectBundleForRecipient(session, input);

      case SessionState.CONFIRM_ORDER_FOR_RECIPIENT:
        return this.handleConfirmOrderForRecipient(session, input);

      case SessionState.ORDER_HISTORY:
        return this.goHome(session);

      default:
        return this.menu.error();
    }
  }

  // ── Menu handlers ────────────────────────────────────────────────────────
  private async handleMainMenu(
    session: SessionData,
    input: string,
  ): Promise<string> {
    switch (input) {
      case '1':
        session.state = SessionState.SELECT_NETWORK;
        session.recipientPhone = session.phoneNumber;
        await this.sessions.save(session);
        return this.menu.selectNetwork();

      case '2':
        session.state = SessionState.ENTER_RECIPIENT;
        await this.sessions.save(session);
        return this.menu.enterRecipient();

      case '3':
        session.state = SessionState.ORDER_HISTORY;
        await this.sessions.save(session);
        return this.menu.orderHistory(session.phoneNumber);

      default:
        return this.menu.invalidInput();
    }
  }

  private async handleSelectNetwork(
    session: SessionData,
    input: string,
  ): Promise<string> {
    const network = this.menu.networkFromInput(input);
    if (!network) return this.menu.invalidInput();

    session.selectedNetwork = network;
    session.state = SessionState.SELECT_BUNDLE;
    await this.sessions.save(session);

    return this.menu.selectBundle(network);
  }

  private async handleSelectBundle(
    session: SessionData,
    input: string,
  ): Promise<string> {
    const bundle = await this.menu.getBundleByIndex(
      session.selectedNetwork as Network,
      input,
    );
    if (!bundle) return this.menu.invalidInput();

    session.selectedBundleId = bundle.id;
    session.selectedBundleLabel = bundle.label;
    session.selectedBundleAmount = bundle.amount;
    session.state = SessionState.CONFIRM_ORDER;
    await this.sessions.save(session);

    return this.menu.confirmOrder(
      session.recipientPhone!,
      bundle.label,
      bundle.amount,
      true,
    );
  }

  private async handleConfirmOrder(
    session: SessionData,
    input: string,
  ): Promise<string> {
    if (input === '2') return this.goHome(session);
    if (input !== '1') return this.menu.invalidInput();

    return this.initiatePayment(session);
    // return this.menu.paymentInitiated(session.recipientPhone!);
  }

  private async handleEnterRecipient(
    session: SessionData,
    input: string,
  ): Promise<string> {
    if (!this.menu.ValidGhanaPhone(input)) {
      return 'CON Invalid number.\nEnter a valid Ghana number\n(e.g. 0241234567):';
    }

    session.recipientPhone = this.menu.normalisePhone(input);
    session.state = SessionState.SELECT_RECIPIENT_NETWORK;
    await this.sessions.save(session);

    return this.menu.selectNetwork();
  }

  private async handleSelectRecipientNetwork(
    session: SessionData,
    input: string,
  ): Promise<string> {
    const network = this.menu.networkFromInput(input);
    if (!network) return this.menu.invalidInput();

    session.selectedNetwork = network;
    session.state = SessionState.SELECT_BUNDLE_FOR_RECIPIENT;
    await this.sessions.save(session);

    return this.menu.selectBundle(network);
  }

  private async handleSelectBundleForRecipient(
    session: SessionData,
    input: string,
  ): Promise<string> {
    const bundle = await this.menu.getBundleByIndex(
      session.selectedNetwork as Network,
      input,
    );
    if (!bundle) return this.menu.invalidInput();

    session.selectedBundleId = bundle.id;
    session.selectedBundleLabel = bundle.label;
    session.selectedBundleAmount = bundle.amount;
    session.state = SessionState.CONFIRM_ORDER_FOR_RECIPIENT;
    await this.sessions.save(session);

    return this.menu.confirmOrder(
      session.recipientPhone!,
      bundle.label,
      bundle.amount,
      false,
    );
  }

  private async handleConfirmOrderForRecipient(
    session: SessionData,
    input: string,
  ): Promise<string> {
    if (input === '2') return this.goHome(session);
    if (input !== '1') return this.menu.invalidInput();

    return this.initiatePayment(session);
    // return this.menu.paymentInitiated(session.recipientPhone!);
  }

  private async initiatePayment(session: SessionData): Promise<string> {
    const user = await this.users.findOrCreate(session.phoneNumber);

    const networkMap: Record<string, Network> = {
      MTN: Network.MTN,
      TELECEL: Network.TELECEL,
      AIRTELTIGO: Network.AIRTELTIGO,
    };

    const recipientNetwork = networkMap[session.selectedNetwork ?? ''];
    if (!recipientNetwork) return this.menu.error();

    // Look up the Prisma UssdSession UUID from the Arkesel session ID string
    const ussdSession = await this.prisma.ussdSession.findUnique({
      where: { sessionId: session.sessionId },
      select: { id: true },
    });

    const order = await this.orders.create({
      userId: user.id,
      bundleId: session.selectedBundleId!,
      recipientPhone: session.recipientPhone!,
      recipientNetwork,
      ussdSessionId: ussdSession?.id ?? undefined,
    });

    session.orderId = order.id;
    await this.sessions.save(session);

    this.payments
      .initiateMoMo(order, session.phoneNumber)
      .catch((err: Error) => {
        this.logger.error(
          `MoMo initiation failed for order ${order.reference}: ${err.message}`,
        );
      });

    return this.menu.paymentInitiated(session.recipientPhone!);
  }

  // ── Navigation ─────────────────────────────────────────────────────────────
  private async goHome(session: SessionData): Promise<string> {
    session.state = SessionState.MAIN_MENU;
    session.selectedNetwork = undefined;
    session.selectedBundleId = undefined;
    session.selectedBundleLabel = undefined;
    session.selectedBundleAmount = undefined;
    await this.sessions.save(session);
    return this.menu.mainMenu();
  }
}
