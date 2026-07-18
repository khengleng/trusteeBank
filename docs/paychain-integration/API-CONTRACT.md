# Trustee Platform — Published API Contract

Integration-readiness reference for **paychain.cambobia.com** and
**paykh.cambobia.com**. Everything here is live on `https://api.trustee.cambobia.com`.

## 1. Machine-readable contract (OpenAPI 3)

| URL | Contents |
|-----|----------|
| `GET /api/v1/openapi.json` | Combined **client** contract (PayChain + PayKH). No internal routes. |
| `GET /api/v1/openapi/paychain.json` | PayChain-only contract |
| `GET /api/v1/openapi/paykh.json` | PayKH-only contract |
| `GET /docs/paychain`, `/docs/paykh` | Swagger UI per client |

These are stable and versioned (`/api/v1`). Breaking changes ship under a new version prefix.

## 2. Readiness

- `GET /health` → `{"status":"ok","db":true}` (200 = ready).

## 3. Stable PayChain routes

- Reserve verification: `GET /api/v1/paychain/reserves/{programId}/current` (eligible reserve + mint capacity + ratio).
- Mint authorization: `POST /api/v1/paychain/mint-authorizations` (request) → trustee maker/checker approve → `POST /api/v1/paychain/mint-authorizations/{id}/confirm`.
- Reserve snapshot / proof: `POST /api/v1/paychain/proof-of-reserve/{programId}/snapshots`, `GET .../latest`, `GET /proof-of-reserve/snapshots/{id}` (signed).
- Redemption: `POST /api/v1/paychain/redemptions`, `.../confirm-burn`, `GET .../payout`.
- Reconciliation: `POST /api/v1/paychain/reconciliations`, `GET /reconciliation-exceptions`.

## 4. Stable PayKH routes

- Payment assurance: `POST /api/v1/paykh/payment-orders` → `POST /api/v1/paykh/payment-orders/{id}/check-payment` (duplicate-safe).
- Signed artifact retrieval: `GET /api/v1/paykh/attestations`, `GET /api/v1/paykh/attestations/{id}` (proof-of-safeguarding, signed).
- Program funds & settlements: `POST /api/v1/paykh/program-funds*`, `POST /api/v1/paykh/settlements*`.
- Reconciliation: `POST /api/v1/paykh/reconciliations/payment-orders`, `.../merchant-settlements`.

## 5. Authentication

Per-client credentials (namespace-scoped). PayChain creds cannot call PayKH routes and vice-versa.

```
X-Client-Id: <clientId>
X-Client-Secret: <clientSecret>
```

(Or HTTP Basic `Authorization: Basic base64(clientId:secret)`.) Trustee admin operators use a separate user login (password + MFA → Bearer token) — not for client integration.

## 6. Request signing, timestamp & replay protection (§28)

Enabled **per client** once you register a public key (contact the trustee bank; the admin registers it via `PUT /api/v1/admin/clients/{platform}/key`). When enabled, every value-changing request (POST/PUT/DELETE/PATCH) MUST include:

| Header | Value |
|--------|-------|
| `X-Timestamp` | epoch **milliseconds**; rejected if skew > 300s |
| `X-Nonce` | unique per request; reuse within the window → rejected (replay) |
| `X-Signature` | base64 Ed25519 signature over the canonical subject |

**Signature algorithm:** Ed25519. **Key ID:** your `clientId`.

**Canonical subject** (what you sign):
```
subject = { method, path, clientId, timestamp, nonce, bodyHash }
bodyHash = sha256_hex(canonical_json(requestBody))   // {} for empty bodies
```
`canonical_json` = JSON with object keys sorted recursively, bigints as decimal
strings, no insignificant whitespace. Sign `canonical_json(subject)` bytes.

Rejections: `401` for missing/invalid signature, stale timestamp, or replayed nonce.

## 7. Public key discovery

`GET /.well-known/trustee-signing-keys` → the platform's Ed25519 public keys by
purpose (`MINT_AUTHORIZATION`, `RESERVE_SNAPSHOT`, `ATTESTATION`, `WEBHOOK`, …).
Stable; verify all signed artifacts and webhooks against the matching purpose key.

## 8. Webhook contract (trustee → client)

Register your receiver URL with the trustee bank. Delivery is **at-least-once**
with retries and a dead-letter threshold (default 8 attempts). Each callback body
is a signed envelope:

```
{ eventId, eventType, eventSequence, targetPlatform, timestamp, clientId,
  programId, correlationId, requestId, nonce, bodyHash, signingKeyId,
  signature, apiVersion, payload }
```

Headers: `X-Trustee-Event-Id`, `X-Trustee-Signature`, `X-Trustee-Signing-Key`,
`X-Trustee-Correlation-Id`, `X-Idempotency-Key`, `X-Api-Version`.

**Verify:** the `signature` (Ed25519, **WEBHOOK** key) is over the canonical JSON
of `{ eventType, targetPlatform, payload }`. Also recompute
`bodyHash = sha256(canonical(payload))` and reject stale timestamps. Consumers
MUST be **idempotent on `eventId`**. A full copy-paste receiver is in
[webhook-receiver-example.md](webhook-receiver-example.md).

**PayChain events:** `funding.instruction.created`, `deposit.detected|cleared|matched`,
`reserve.snapshot.created`, `reserve.shortfall.detected`,
`mint.authorization.approved|rejected|expired`, `mint.confirmed`,
`redemption.approved|burn.confirmed|payout.submitted|payout.confirmed|completed`,
`reconciliation.exception.created`, `program.suspended`.

**PayKH events:** `paykh.payment.detected|confirmed|rejected|duplicate|refunded`,
`paykh.payment-profile.verified|suspended`,
`paykh.program-fund.cleared|low|exhausted`,
`paykh.settlement.approved|submitted|confirmed`, `paykh.tenant.suspended`.

## 9. Error contract

All errors return JSON:
```
{ "statusCode": <int>, "message": <string|string[]>, "reasons"?: [<code>...] }
```

| Code | Meaning |
|------|---------|
| 400 | Validation error, or a guard block (`reasons` lists codes, e.g. `INSUFFICIENT_CAPACITY`, `DEPOSIT_NOT_CLEARED`) |
| 401 | Missing/invalid credentials, signature, timestamp, or replayed nonce |
| 403 | Client separation / RBAC violation |
| 404 | Not found |
| 409 | Conflict — idempotency key reused with a different body, or duplicate bank transaction |
| 500 | Internal error (no sensitive detail leaked) |

## 10. Idempotency

Send `Idempotency-Key` on value-changing POSTs. Same key + same body → the stored
response is replayed. Same key + different body → `409`. Scope your keys per
operation. Duplicate mint authorizations and duplicate payouts are structurally
prevented (single-use authorizations; one bank transaction → one payment order).

## 11. Amounts & correlation

Money is integer **minor units as strings** (`"100000"` = 1,000.00) + 3-letter
currency. Propagate a `correlationId` through request bodies so a transaction is
traceable across PayKH → Trustee → PayChain and PayChain → Trustee → Bank.
