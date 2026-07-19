/**
 * HTTP implementations of the PayChain and PayKH adapters. They deliver signed
 * envelopes to the client's registered webhook URL and read supply/status via
 * versioned REST. Uses the global `fetch` (Node 18+). Network/replay controls
 * (retries, DLQ) are handled by the webhook worker that drives these.
 */

import type {
  AssetSupply,
  DeliveryResult,
  IntegrationHealth,
  PayChainAdapter,
  PayKHAdapter,
  SignedEnvelope,
} from './interfaces';

export interface HttpAdapterConfig {
  baseUrl: string;
  webhookUrl: string;
  apiVersion: string;
  /** Optional bearer/OAuth token for authenticated reads. */
  authToken?: string;
  timeoutMs?: number;
}

async function post(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The exact JSON body delivered on the wire: the envelope minus header-only
 * fields (`requestSignature`, `timestampMs`). The worker computes the Stripe
 * signature over this same serialization, so signed and sent bytes match.
 */
function wireBody(env: SignedEnvelope): Record<string, unknown> {
  const { requestSignature: _rs, timestampMs: _ts, ...body } = env;
  return body;
}

function envelopeHeaders(env: SignedEnvelope): Record<string, string> {
  const ts = env.timestampMs || String(Date.parse(env.timestamp) || env.timestamp);
  const sig = env.requestSignature || env.signature;
  return {
    // Stripe-style headers (PayKH convention).
    'x-signature': sig,
    'x-timestamp': ts,
    'x-nonce': env.nonce,
    'x-signing-key-id': env.signingKeyId,
    // Trustee-prefixed headers (PayChain convention).
    'x-trustee-signature': sig,
    'x-trustee-timestamp': ts,
    'x-trustee-delivery': env.eventId,
    'x-trustee-event-id': env.eventId,
    'x-trustee-signing-key': env.signingKeyId,
    'x-trustee-correlation-id': env.correlationId,
    'x-idempotency-key': env.requestId,
    'x-api-version': env.apiVersion,
  };
}

export class HttpPayChainAdapter implements PayChainAdapter {
  constructor(private readonly config: HttpAdapterConfig) {}

  async getAssetSupply(assetId: string): Promise<AssetSupply> {
    const url = `${this.config.baseUrl}/api/v1/trustee/assets/${assetId}/supply`;
    const res = await fetch(url, {
      headers: this.config.authToken
        ? { authorization: `Bearer ${this.config.authToken}` }
        : {},
    });
    if (!res.ok) throw new Error(`PayChain supply fetch failed: ${res.status}`);
    return (await res.json()) as AssetSupply;
  }

  async submitSignedEvent(envelope: SignedEnvelope): Promise<DeliveryResult> {
    try {
      const r = await post(
        this.config.webhookUrl,
        wireBody(envelope),
        envelopeHeaders(envelope),
        this.config.timeoutMs ?? 10000,
      );
      return { delivered: r.ok, statusCode: r.status, attempt: 1, error: r.ok ? undefined : r.text };
    } catch (err) {
      return { delivered: false, attempt: 1, error: (err as Error).message };
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

export class HttpPayKHAdapter implements PayKHAdapter {
  constructor(private readonly config: HttpAdapterConfig) {}

  async submitSignedEvent(envelope: SignedEnvelope): Promise<DeliveryResult> {
    try {
      const r = await post(
        this.config.webhookUrl,
        wireBody(envelope),
        envelopeHeaders(envelope),
        this.config.timeoutMs ?? 10000,
      );
      return { delivered: r.ok, statusCode: r.status, attempt: 1, error: r.ok ? undefined : r.text };
    } catch (err) {
      return { delivered: false, attempt: 1, error: (err as Error).message };
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
