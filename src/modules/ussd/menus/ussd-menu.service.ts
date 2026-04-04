import { Injectable } from '@nestjs/common';
import { Network } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class UssdMenuService {
  constructor(private readonly prisma: PrismaService) {}

  mainMenu(): string {
    return (
      'CON Welcome to DataHub\n' +
      '1. Buy data bundle\n' +
      '2. Buy for someone else\n' +
      '3. My orders'
    );
  }

  selectNetwork(): string {
    return (
      'CON Select network:\n' + '1. MTN\n' + '2. Telecel\n' + '3. AirtelTigo'
    );
  }

  networkFromInput(input: string): Network | null {
    const map: Record<string, Network> = {
      '1': Network.MTN,
      '2': Network.TELECEL,
      '3': Network.AIRTELTIGO,
    };
    return map[input] ?? null;
  }

  networkLabel(network: Network): string {
    const labels: Record<Network, string> = {
      [Network.MTN]: 'MTN',
      [Network.TELECEL]: 'Telecel',
      [Network.AIRTELTIGO]: 'AirtelTigo',
    };
    return labels[network];
  }

  async selectBundle(network: Network): Promise<string> {
    const bundles = await this.prisma.bundle.findMany({
      where: { network, isActive: true },
      orderBy: { sortOrder: 'asc' },
      take: 8,
    });

    if (!bundles.length) {
      return `END No bundles available for ${this.networkLabel(network)}. Try again later.`;
    }

    const lines = bundles.map((b, i) => {
      const size =
        b.dataMb! >= 1024
          ? `${(b.dataMb! / 1024).toFixed(0)}GB`
          : `${b.dataMb}MB`;
      const price = (b.sellingPrice / 100).toFixed(2);
      return `${i + 1}. ${size} - GH₵${price} (${b.validityDays}d)`;
    });

    return `CON Select bundle:\n${lines.join('\n')}`;
  }

  async getBundleByIndex(
    network: Network,
    input: string,
  ): Promise<{ id: string; label: string; amount: number } | null> {
    const index = parseInt(input, 10);
    if (isNaN(index) || index < 1) return null;

    const bundles = await this.prisma.bundle.findMany({
      where: { network, isActive: true },
      orderBy: { sortOrder: 'asc' },
      take: 8,
    });

    const bundle = bundles[index - 1];
    if (!bundle) return null;

    const size =
      bundle.dataMb! >= 1024
        ? `${(bundle.dataMb! / 1024).toFixed(0)}GB`
        : `${bundle.dataMb}MB`;
    const price = (bundle.sellingPrice / 100).toFixed(2);

    return {
      id: bundle.id,
      label: `${size} - GH₵${price} (${bundle.validityDays}d)`,
      amount: bundle.sellingPrice,
    };
  }

  confirmOrder(
    recipientPhone: string,
    bundleLabel: string,
    amount: number,
    isSelf: boolean,
  ): string {
    const price = (amount / 100).toFixed(2);
    const forLine = isSelf ? `For: Your number` : `For: ${recipientPhone}`;
    return (
      `CON Confirm order:\n` +
      `Bundle: ${bundleLabel}\n` +
      `${forLine}\n` +
      `Amount: GH₵${price}\n\n` +
      `1. Confirm & pay\n` +
      `2. Cancel`
    );
  }

  enterRecipient(): string {
    return 'CON Enter recipient phone number\n(e.g. 0241234567):';
  }

  ValidGhanaPhone(phone: string): boolean {
    return /^(0|\+233)[2-9]\d{8}$/.test(phone.trim());
  }

  normalisePhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.startsWith('0')) return '+233' + digits.slice(1);
    if (digits.startsWith('233')) return '+' + digits;
    return phone;
  }

  async orderHistory(phoneNumber: string): Promise<string> {
    const orders = await this.prisma.order.findMany({
      where: { user: { phoneNumber } },
      include: { bundle: true },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (!orders.length) {
      return 'END You have no previous orders.';
    }

    const lines = orders.map((o, i) => {
      const size =
        o.bundle.dataMb! >= 1024
          ? `${(o.bundle.dataMb! / 1024).toFixed(0)}GB`
          : `${o.bundle.dataMb}MB`;
      const status = o.status === 'FULFILLED' ? 'OK' : o.status.toLowerCase();
      const date = new Date(o.createdAt).toLocaleDateString('en-GH', {
        day: '2-digit',
        month: 'short',
      });
      return `${i + 1}. ${size} ${o.recipientPhone.slice(-4)} ${date} [${status}]`;
    });

    return `END Recent orders:\n${lines.join('\n')}`;
  }

  paymentInitiated(recipientPhone: string): string {
    return (
      `END MoMo prompt sent to your number.\n` +
      `Approve to activate bundle for ${recipientPhone}.\n` +
      `You will receive an SMS confirmation.`
    );
  }

  invalidInput(): string {
    return 'CON Invalid input. Please try again.\n\n0. Back\n#. Main menu';
  }

  error(): string {
    return 'END Something went wrong. Please try again.';
  }
}
