import { Injectable, Logger } from '@nestjs/common';
import { money, type Money } from '@trustee/domain';
import { HttpTrusteeBankAdapter, type TrusteeBankAdapter } from '@trustee/adapters';

/**
 * Core-banking balance service (update §26). Reads the trustee's real cleared
 * bank balance so reserve figures can be reconciled against what the bank
 * actually holds — turning proof-of-reserve from "trust the ledger" into "prove
 * the ledger". Read-only; the trustee never moves money here.
 *
 * - `BANK_API_URL` set -> live reads via {@link HttpTrusteeBankAdapter}.
 * - unset              -> manual/simulation mode (returns null; the ledger stays
 *   authoritative and bank reconciliation is skipped, clearly flagged).
 *
 * A rolling `lastSuccessfulCheck` timestamp powers the mint guard's
 * bank-connectivity staleness signal (§17).
 */
@Injectable()
export class BankBalanceService {
  private readonly logger = new Logger(BankBalanceService.name);
  private readonly adapter: TrusteeBankAdapter | null;
  private lastSuccessfulCheck: number | null = null;
  readonly live: boolean;

  constructor() {
    const baseUrl = process.env.BANK_API_URL;
    if (baseUrl) {
      this.adapter = new HttpTrusteeBankAdapter({
        baseUrl,
        authToken: process.env.BANK_API_TOKEN,
        timeoutMs: Number(process.env.BANK_API_TIMEOUT_MS ?? 10000),
      });
      this.live = true;
    } else {
      this.adapter = null;
      this.live = false;
      this.logger.warn(
        'BANK_API_URL not set — bank-balance reconciliation runs in manual mode (ledger authoritative, no independent bank check). Configure it for production (§26).',
      );
    }
  }

  /** Cleared bank balance for an account, or null in manual mode. */
  async clearedBalance(accountRef: string, currency: string): Promise<Money | null> {
    if (!this.adapter) return null;
    const res = await this.adapter.getAccountBalance(accountRef);
    this.lastSuccessfulCheck = Date.now();
    return money(BigInt(res.clearedMinor), res.currency || currency);
  }

  /** Seconds since the last successful bank read, or null if never / manual. */
  lastCheckAgeSeconds(): number | null {
    if (this.lastSuccessfulCheck === null) return this.live ? Number.MAX_SAFE_INTEGER : null;
    return Math.max(0, Math.floor((Date.now() - this.lastSuccessfulCheck) / 1000));
  }
}
