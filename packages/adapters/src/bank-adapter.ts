/**
 * HTTP core-banking adapter (update §26). Reads the trustee's real cleared
 * account balance from the bank's API so the platform can reconcile its internal
 * reserve ledger against what the bank actually holds. The trustee never moves
 * money here — this is read-only balance/So the ledger is proven, not assumed.
 *
 * Endpoint the bank (or an integration middleware) exposes:
 *   GET {baseUrl}/accounts/{accountRef}/balance -> BankAccountBalance
 */

import type {
  BankAccountBalance,
  IntegrationHealth,
  TrusteeBankAdapter,
} from './interfaces';

export interface HttpBankConfig {
  baseUrl: string;
  authToken?: string;
  timeoutMs?: number;
}

export class HttpTrusteeBankAdapter implements TrusteeBankAdapter {
  constructor(private readonly config: HttpBankConfig) {}

  async getAccountBalance(accountRef: string): Promise<BankAccountBalance> {
    const url = `${this.config.baseUrl}/accounts/${encodeURIComponent(accountRef)}/balance`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 10000);
    try {
      const res = await fetch(url, {
        headers: this.config.authToken ? { authorization: `Bearer ${this.config.authToken}` } : {},
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Bank balance fetch failed: ${res.status}`);
      return (await res.json()) as BankAccountBalance;
    } finally {
      clearTimeout(timer);
    }
  }

  async healthCheck(): Promise<IntegrationHealth> {
    try {
      const res = await fetch(`${this.config.baseUrl}/health`);
      return { healthy: res.ok };
    } catch (err) {
      return { healthy: false, detail: (err as Error).message };
    }
  }
}
