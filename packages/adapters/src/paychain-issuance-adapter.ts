/**
 * HTTP PayChain issuance gateway (update §23). The trustee POSTs a signed
 * issuance/burn request to PayChain's execution endpoint; PayChain performs the
 * on-chain mint/clawback on Stellar and returns the tx reference. The trustee
 * never holds Stellar keys — it authorizes and delegates execution here, then
 * independently verifies on-chain supply via Horizon.
 *
 * Endpoint PayChain must implement (the contract, if not yet built):
 *   POST {baseUrl}/api/v1/trustee/issuance/execute
 *   body: IssuanceExecutionRequest
 *   200 : IssuanceExecutionResult
 */

import type {
  IntegrationHealth,
  IssuanceExecutionRequest,
  IssuanceExecutionResult,
  PayChainIssuanceAdapter,
} from './interfaces';

export interface PayChainIssuanceConfig {
  baseUrl: string;
  apiVersion: string;
  authToken?: string;
  timeoutMs?: number;
}

export class HttpPayChainIssuanceAdapter implements PayChainIssuanceAdapter {
  constructor(private readonly config: PayChainIssuanceConfig) {}

  async execute(req: IssuanceExecutionRequest): Promise<IssuanceExecutionResult> {
    const url = `${this.config.baseUrl}/api/v1/trustee/issuance/execute`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 15000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-version': this.config.apiVersion,
          'x-idempotency-key': req.reference,
          ...(this.config.authToken ? { authorization: `Bearer ${this.config.authToken}` } : {}),
        },
        body: JSON.stringify(req),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        return { accepted: false, status: 'REJECTED', detail: `HTTP ${res.status}: ${text.slice(0, 200)}` };
      }
      return JSON.parse(text) as IssuanceExecutionResult;
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
