# Trustee Webhook Receiver — Ready-to-Paste (PayChain & PayKH)

The trustee platform (`api.trustee.cambobia.com`) delivers **signed events** to each
client's registered URL:

```
POST https://api.paychain.cambobia.com/api/v1/trustee/events
POST https://api.paykh.cambobia.com/api/v1/trustee/events
```

Delivery is **at-least-once** with retries + dead-lettering. You must implement
this endpoint, **verify the signature**, be **idempotent on `eventId`**, and
return **2xx** quickly. This is the only endpoint you need to add.

## The request body (signed envelope)

```jsonc
{
  "eventId": "…",            // dedupe on this
  "eventType": "mint.confirmed" | "paykh.payment.confirmed" | …,
  "eventSequence": "42",
  "targetPlatform": "PAYCHAIN" | "PAYKH",
  "timestamp": "2026-07-19T…Z",
  "clientId": "client_paychain_demo",
  "programId": "…",
  "correlationId": "…",
  "requestId": "…",
  "nonce": "…",
  "bodyHash": "sha256 hex of canonical(payload)",
  "signingKeyId": "webhook-…",
  "signature": "base64 ed25519",
  "apiVersion": "v1",
  "payload": { /* event-specific */ }
}
```

## What to verify

The **`signature`** is an Ed25519 signature over the **canonical JSON** of the
subject `{ eventType, targetPlatform, payload }`, made with the trustee's
**WEBHOOK** key. Verify it with the WEBHOOK public key from
`GET https://api.trustee.cambobia.com/.well-known/trustee-signing-keys`
(the entry whose `purpose` is `WEBHOOK`). Canonical JSON = keys sorted
recursively, `bigint` as decimal string, no insignificant whitespace.

> Also sanity-check `bodyHash === sha256_hex(canonical(payload))` and reject if
> `timestamp` is older than a few minutes.

## Node / Express (copy-paste)

```js
// npm i express
const express = require('express');
const crypto = require('crypto');

const TRUSTEE_KEYS_URL = 'https://api.trustee.cambobia.com/.well-known/trustee-signing-keys';

// --- canonical JSON: MUST match the trustee (sorted keys, bigint->string) ---
function canonicalize(v) { return JSON.stringify(sortValue(v)); }
function sortValue(v) {
  if (typeof v === 'bigint') return v.toString();
  if (Array.isArray(v)) return v.map(sortValue);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortValue(v[k]);
    return out;
  }
  return v;
}

// --- cache the WEBHOOK public key (refresh hourly) ---
let webhookKey = null, keyFetchedAt = 0;
async function getWebhookKey() {
  if (webhookKey && Date.now() - keyFetchedAt < 3600_000) return webhookKey;
  const res = await fetch(TRUSTEE_KEYS_URL);
  const { keys } = await res.json();
  const k = keys.find((x) => x.purpose === 'WEBHOOK');
  if (!k) throw new Error('WEBHOOK key not found');
  webhookKey = crypto.createPublicKey(k.publicKeyPem);
  keyFetchedAt = Date.now();
  return webhookKey;
}

const seen = new Set(); // replace with a durable store (Redis/DB) in production

const app = express();
app.use(express.json({ limit: '1mb' }));

app.post('/api/v1/trustee/events', async (req, res) => {
  const env = req.body || {};
  try {
    // 1) signature over { eventType, targetPlatform, payload }
    const subject = { eventType: env.eventType, targetPlatform: env.targetPlatform, payload: env.payload };
    const key = await getWebhookKey();
    const ok = crypto.verify(null, Buffer.from(canonicalize(subject)), key, Buffer.from(env.signature, 'base64'));
    if (!ok) return res.status(401).json({ error: 'bad signature' });

    // 2) body hash + freshness (defence in depth)
    const bodyHash = crypto.createHash('sha256').update(canonicalize(env.payload)).digest('hex');
    if (env.bodyHash && env.bodyHash !== bodyHash) return res.status(400).json({ error: 'bad bodyHash' });
    if (env.timestamp && Math.abs(Date.now() - Date.parse(env.timestamp)) > 10 * 60_000) {
      return res.status(400).json({ error: 'stale timestamp' });
    }

    // 3) idempotency
    if (seen.has(env.eventId)) return res.status(200).json({ ok: true, duplicate: true });
    seen.add(env.eventId);

    // 4) handle the event (fast; queue heavy work)
    switch (env.eventType) {
      case 'mint.confirmed': /* … */ break;
      case 'reserve.snapshot.created': /* … */ break;
      case 'paykh.payment.confirmed': /* … */ break;
      // …
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    // Return 5xx so the trustee retries; 4xx (bad sig/format) will dead-letter.
    return res.status(500).json({ error: String(e && e.message || e) });
  }
});

app.listen(process.env.PORT || 8080);
```

## NestJS note

Same logic inside a `@Post('api/v1/trustee/events')` handler; verify **before**
any DTO transformation, and persist `eventId` (unique index) for idempotency.

## After you deploy the receiver

Tell the trustee team — they will **replay** any events that dead-lettered while
your endpoint was missing (Admin console → **Webhooks** → *Replay all
dead-lettered*, or `POST /api/v1/admin/webhooks/replay-dead-lettered`).

## Events you'll receive

**PayChain:** `funding.instruction.created`, `deposit.detected|cleared|matched`,
`reserve.snapshot.created`, `reserve.shortfall.detected`,
`mint.authorization.approved|rejected|expired`, `mint.confirmed`,
`redemption.approved|burn.confirmed|payout.submitted|payout.confirmed|completed`,
`reconciliation.exception.created`, `program.suspended`.

**PayKH:** `paykh.payment.detected|confirmed|rejected|duplicate|refunded`,
`paykh.payment-profile.verified|suspended`,
`paykh.program-fund.cleared|low|exhausted`,
`paykh.settlement.approved|submitted|confirmed`, `paykh.tenant.suspended`.
