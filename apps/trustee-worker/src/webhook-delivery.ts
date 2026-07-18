/**
 * Webhook delivery worker (§29 base spec, update §18/§19). Reads undelivered
 * signed events from the transactional outbox and delivers them to the target
 * client's registered webhook URL with retries and a dead-letter threshold.
 *
 * Correlation IDs follow the transaction across systems (changeforpaychainandpaykh
 * §10). Delivery is at-least-once; consumers must be idempotent on eventId.
 */

import { getPrisma } from '@trustee/database';
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
        nonce: `${event.id}-${event.sequence.toString()}`,
        apiVersion: API_VERSION,
        payload,
      },
      { keyId: event.signatureKeyId, algorithm: 'ed25519', value: event.signatureValue },
    );

    const adapter =
      event.targetPlatform === 'PAYKH'
        ? paykhAdapter(client.webhookUrl)
        : paychainAdapter(client.webhookUrl);
    const result = await adapter.submitSignedEvent(envelope);

    if (result.delivered) {
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { deliveredAt: now, attempts: event.attempts + 1 },
      });
      delivered += 1;
    } else {
      await markAttempt(event.id, event.attempts + 1, result.error);
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
