/**
 * Webhook delivery worker (§29 base spec, update §18/§19). Reads undelivered
 * signed events from the transactional outbox and delivers them to the target
 * client's registered webhook URL with retries and a dead-letter threshold.
 *
 * Correlation IDs follow the transaction across systems (changeforpaychainandpaykh
 * §10). Delivery is at-least-once; consumers must be idempotent on eventId.
 */

import { createPrivateKey, sign as edSign } from 'node:crypto';
import { getPrisma } from '@trustee/database';
import { type SigningKey } from '@trustee/cryptography';
import {
  HttpPayChainAdapter,
  HttpPayKHAdapter,
  buildSignedEnvelope,
  type PayChainAdapter,
  type PayKHAdapter,
} from '@trustee/adapters';

const MAX_ATTEMPTS = Number(process.env.WEBHOOK_MAX_ATTEMPTS ?? 8);
const BATCH_SIZE = Number(process.env.WEBHOOK_BATCH_SIZE ?? 25);
const API_VERSION = 'v1';

const prisma = getPrisma();

/** Load the WEBHOOK signing key from TRUSTEE_SIGNING_KEYS so the worker can sign
 * each delivery with the §28 request-subject that header-based receivers verify. */
function loadWebhookKey(): SigningKey | null {
  const raw = process.env.TRUSTEE_SIGNING_KEYS;
  if (!raw) return null;
  try {
    const json = raw.trimStart().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(json) as Record<string, { keyId: string; privateKeyPem: string; publicKeyPem: string; createdAt?: string }>;
    const k = parsed.WEBHOOK;
    if (!k) return null;
    return { keyId: k.keyId, purpose: 'WEBHOOK', privateKeyPem: k.privateKeyPem, publicKeyPem: k.publicKeyPem, createdAt: k.createdAt ?? '1970-01-01T00:00:00.000Z' };
  } catch {
    return null;
  }
}
const webhookKey = loadWebhookKey();
const webhookPrivateKey = webhookKey ? createPrivateKey(webhookKey.privateKeyPem) : null;

/**
 * Stripe-style webhook signature: Ed25519 over `${timestampMs}.${rawBody}`,
 * where rawBody is the exact JSON body bytes delivered. The client verifies
 * X-Signature by recomputing this over X-Timestamp + the received body.
 */
function stripeSignature(timestampMs: string, rawBody: string): string | undefined {
  if (!webhookPrivateKey) return undefined;
  return edSign(null, Buffer.from(`${timestampMs}.${rawBody}`), webhookPrivateKey).toString('base64');
}

function paychainAdapter(webhookUrl: string): PayChainAdapter {
  return new HttpPayChainAdapter({
    baseUrl: process.env.PAYCHAIN_API_URL ?? 'https://api.paychain.cambobia.com',
    webhookUrl,
    apiVersion: API_VERSION,
  });
}

function paykhAdapter(webhookUrl: string): PayKHAdapter {
  return new HttpPayKHAdapter({
    baseUrl: process.env.PAYKH_API_URL ?? 'https://api.paykh.cambobia.com',
    webhookUrl,
    apiVersion: API_VERSION,
  });
}

/** One delivery pass over pending outbox events. Returns count delivered. */
export async function deliverPending(now: Date): Promise<number> {
  const pending = await prisma.outboxEvent.findMany({
    where: { deliveredAt: null, deadLettered: false },
    orderBy: { sequence: 'asc' },
    take: BATCH_SIZE,
  });

  let delivered = 0;
  for (const event of pending) {
    const client = await prisma.clientApplication.findUnique({
      where: { platform: event.targetPlatform },
    });
    if (!client || !client.webhookUrl || client.disabled) {
      await markAttempt(event.id, event.attempts + 1, `no active webhook for ${event.targetPlatform}`);
      continue;
    }

    const payload = (event.payload ?? {}) as Record<string, unknown>;
    const correlationId =
      (payload.correlationId as string | undefined) ?? `corr_${event.id}`;
    const timestampMs = String(now.getTime());
    const nonce = `${event.id}-${event.sequence.toString()}`;
    const envelope = buildSignedEnvelope(
      {
        eventId: event.id,
        eventType: event.eventType,
        eventSequence: event.sequence.toString(),
        targetPlatform: event.targetPlatform,
        timestamp: now.toISOString(),
        clientId: client.oauthClientId,
        programId: payload.programId as string | undefined,
        correlationId,
        requestId: `req_${event.id}`,
        nonce,
        apiVersion: API_VERSION,
        payload,
      },
      { keyId: event.signatureKeyId, algorithm: 'ed25519', value: event.signatureValue },
    );
    envelope.occurredAt = event.createdAt.toISOString();
    // Artifact-bearing events (trustee-events-contract): surface the inner signed
    // artifact string + its purpose-key signature as a top-level object.
    if (event.artifact) {
      envelope.artifact = event.artifact;
      envelope.signature = { keyId: event.signatureKeyId, alg: 'ed25519', value: event.signatureValue };
    }
    // Stripe-style header signature over `${timestampMs}.${rawBody}`. Compute the
    // rawBody AFTER the body-visible fields above but BEFORE header-only fields
    // (the adapter strips them), so worker-signed and adapter-sent bytes match.
    const rawBody = JSON.stringify(envelope);
    envelope.timestampMs = timestampMs;
    envelope.requestSignature = stripeSignature(timestampMs, rawBody);

    const adapter =
      event.targetPlatform === 'PAYKH'
        ? paykhAdapter(client.webhookUrl)
        : paychainAdapter(client.webhookUrl);
    const result = await adapter.submitSignedEvent(envelope);
    const attempt = event.attempts + 1;

    // Record this attempt for the delivery log (§29).
    await prisma.webhookDelivery.create({
      data: {
        eventId: event.id,
        attempt,
        statusCode: result.statusCode ?? null,
        ok: result.delivered,
        error: result.error ? result.error.slice(0, 500) : null,
      },
    });

    if (result.delivered) {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { deliveredAt: now, attempts: attempt },
      });
      delivered += 1;
    } else {
      await markAttempt(event.id, attempt, result.error);
    }
  }
  return delivered;
}

async function markAttempt(id: string, attempts: number, error?: string): Promise<void> {
  const deadLettered = attempts >= MAX_ATTEMPTS;
  await prisma.outboxEvent.update({
    where: { id },
    data: { attempts, deadLettered },
  });
  if (deadLettered) {
    // eslint-disable-next-line no-console
    console.error(`[webhook] event ${id} dead-lettered after ${attempts} attempts: ${error ?? ''}`);
  }
}
