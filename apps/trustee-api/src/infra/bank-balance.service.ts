import { Injectable, Logger } from '@nestjs/common';
import { money, type Money } from '@trustee/domain';
import { HttpTrusteeBankAdapter } from '@trustee/adapters';
import { PrismaService } from './prisma.service';

export interface AccountBalanceRef {
  id: string;
  bankId: string | null;
  coreBankingRef: string | null;
  currency: string;
  mockClearedMinor: bigint;
}

export interface BankBalanceResult {
  minor: bigint;
  currency: string;
  /** mock | api | manual — how this balance was obtained. */
  source: 'mock' | 'api' | 'manual';
  bankId: string | null;
}

/**
 * Multi-bank core-banking balance service (update §26). The trustee holds
 * reserves across MANY banks; each TrusteeAccount resolves to a BankConnection
 * that says how to read its balance:
 *
 * - MOCK (default): operator-set `mockClearedMinor` on the account — lets the
 *   whole reserve/reconciliation flow work as a mockup with no real bank.
 * - API: live read via {@link HttpTrusteeBankAdapter} using the connection's
 *   baseUrl + a token named by `authTokenEnv` (secret never stored in the DB).
 * - MANUAL/STATEMENT: offline — returns null (ledger stays authoritative).
 *
 * A rolling `lastSuccessfulCheck` (updated on any live API read) powers the mint
 * guard's bank-connectivity staleness signal (§17).
 */
@Injectable()
export class BankBalanceService {
  private readonly logger = new Logger(BankBalanceService.name);
  private lastSuccessfulCheck: number | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Cleared balance for a single account, resolving its bank connection. */
  async clearedBalanceForAccount(account: AccountBalanceRef): Promise<BankBalanceResult | null> {
    const conn = account.bankId
      ? await this.prisma.bankConnection.findUnique({ where: { bankId: account.bankId } })
      : null;
    const mode = conn?.integrationMode ?? 'MOCK';

    if (mode === 'API' && conn?.baseUrl) {
      const token = conn.authTokenEnv ? process.env[conn.authTokenEnv] : undefined;
      const adapter = new HttpTrusteeBankAdapter({ baseUrl: conn.baseUrl, authToken: token });
      const res = await adapter.getAccountBalance(account.coreBankingRef ?? account.id);
      this.lastSuccessfulCheck = Date.now();
      return {
        minor: BigInt(res.clearedMinor),
        currency: res.currency || account.currency,
        source: 'api',
        bankId: account.bankId,
      };
    }
    if (mode === 'MOCK') {
      return { minor: account.mockClearedMinor, currency: account.currency, source: 'mock', bankId: account.bankId };
    }
    // MANUAL / STATEMENT — no automated balance.
    return null;
  }

  /** Seconds since the last successful LIVE bank read, or null if never/none live. */
  lastCheckAgeSeconds(): number | null {
    if (this.lastSuccessfulCheck === null) return null;
    return Math.max(0, Math.floor((Date.now() - this.lastSuccessfulCheck) / 1000));
  }

  /** Convenience Money wrapper. */
  money(minor: bigint, currency: string): Money {
    return money(minor, currency);
  }
}
