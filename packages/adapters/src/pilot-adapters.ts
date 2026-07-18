/**
 * Pilot/manual implementations of the trustee-bank, KHQR and compliance adapters
 * for the development and demo environment (base spec §11/§21, update §14).
 *
 * These contain NO real bank connectivity and process NO real funds. They exist
 * so the end-to-end flows are exercisable on Railway dev/UAT before an approved
 * core-banking integration is connected. Production must replace them with the
 * bank-approved integrations (base spec §5, update §32).
 */

import { sha256Hex } from '@trustee/cryptography';
import type {
  BankAccountBalance,
  ComplianceProviderAdapter,
  IntegrationHealth,
  KHQRProviderAdapter,
  KhqrPaymentRef,
  ScreeningResult,
  TrusteeBankAdapter,
} from './interfaces';

/** Manual dual-control bank adapter: balances are supplied out-of-band by ops. */
export class ManualTrusteeBankAdapter implements TrusteeBankAdapter {
  constructor(private readonly balances: Map<string, BankAccountBalance> = new Map()) {}

  setBalance(balance: BankAccountBalance): void {
    this.balances.set(balance.accountRef, balance);
  }

  async getAccountBalance(accountRef: string): Promise<BankAccountBalance> {
    const b = this.balances.get(accountRef);
    if (!b) throw new Error(`No manual balance recorded for ${accountRef}`);
    return b;
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return { healthy: true, detail: 'manual dual-control mode' };
  }
}

/** Derives a deterministic KHQR reference for the pilot (no external service). */
export class PilotKhqrAdapter implements KHQRProviderAdapter {
  async createPaymentReference(input: {
    recipientPayload: string;
    amountMinor: string;
    currency: string;
  }): Promise<KhqrPaymentRef> {
    const reference = `KHQR-${sha256Hex(
      `${input.recipientPayload}:${input.amountMinor}:${input.currency}`,
    )
      .slice(0, 12)
      .toUpperCase()}`;
    return {
      reference,
      khqrString: `${input.recipientPayload}|amt=${input.amountMinor}|ref=${reference}`,
    };
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return { healthy: true, detail: 'pilot KHQR derivation' };
  }
}

/** Pilot compliance adapter: clears low amounts, flags large round values. */
export class PilotComplianceAdapter implements ComplianceProviderAdapter {
  async screenPerson(input: { fullName: string; country?: string }): Promise<ScreeningResult> {
    const cleared = input.fullName.trim().length > 0;
    return { cleared, riskLevel: cleared ? 'LOW' : 'HIGH' };
  }

  async screenDeposit(input: {
    payerName?: string;
    amountMinor: string;
    currency: string;
  }): Promise<ScreeningResult> {
    const amount = BigInt(input.amountMinor);
    const large = amount >= 1_000_000_00n; // >= 1,000,000.00 units
    return {
      cleared: true,
      riskLevel: large ? 'MEDIUM' : 'LOW',
    };
  }

  async healthCheck(): Promise<IntegrationHealth> {
    return { healthy: true, detail: 'pilot compliance stub' };
  }
}
