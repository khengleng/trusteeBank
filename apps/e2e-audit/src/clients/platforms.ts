import { call, type HttpResult } from '../http';
import type { AuditConfig } from '../config';

/**
 * Thin clients for the platforms the trustee integrates with. Endpoints follow
 * each platform's published contract. When a base URL is unconfigured the call
 * short-circuits so the stage is recorded NOT_READY rather than erroring.
 */
export class PayChainClient {
  constructor(private readonly cfg: AuditConfig) {}
  configured(): boolean {
    return !!this.cfg.paychainBase;
  }
  createWallet(customerRef: string): Promise<HttpResult> {
    return call({ base: this.cfg.paychainBase }, 'POST', '/wallets', { customerRef });
  }
  /** Mint / earn — the PayChain endpoint the last E2E test hit (404). */
  earn(assetId: string, body: unknown): Promise<HttpResult> {
    return call({ base: this.cfg.paychainBase }, 'POST', `/assets/${assetId}/earn`, body);
  }
}

export class PayKHClient {
  constructor(private readonly cfg: AuditConfig) {}
  configured(): boolean {
    return !!this.cfg.paykhBase;
  }
  purchase(body: unknown): Promise<HttpResult> {
    return call({ base: this.cfg.paykhBase }, 'POST', '/purchases', body);
  }
  awardPoints(body: unknown): Promise<HttpResult> {
    return call({ base: this.cfg.paykhBase }, 'POST', '/loyalty/award', body);
  }
}
