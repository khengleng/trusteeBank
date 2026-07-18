# Integration Guide — PayChain & PayKH ↔ Trustee Platform

For the teams operating `paychain.cambobia.com` and `paykh.cambobia.com`. The
trustee platform is **live on Railway**.

## Endpoints

| Purpose | URL |
|---------|-----|
| Trustee API (all client calls) | `https://api.trustee.cambobia.com` |
| Admin portal (trustee bank ops) | `https://trustee.cambobia.com` |
| API docs (Swagger) | `https://api.trustee.cambobia.com/docs` |
| Public signing keys | `https://api.trustee.cambobia.com/.well-known/trustee-signing-keys` |
| Health | `https://api.trustee.cambobia.com/health` |

## Authentication (pilot)

Every client call sends its credentials as headers (or HTTP Basic). Credentials
are **per client**; PayChain credentials cannot call PayKH routes and vice-versa.

```
X-Client-Id: <clientId>
X-Client-Secret: <clientSecret>
```

Pilot credentials (issued by the seed — **rotate before production**, §27):

| Platform | Client ID | Namespace it may call |
|----------|-----------|-----------------------|
| PayChain | `client_paychain_demo` | `/api/v1/paychain/*` |
| PayKH | `client_paykh_demo` | `/api/v1/paykh/*` |
| Trustee Bank | `client_trustee_bank` | `/api/v1/trustee/*`, `/api/v1/bank/*`, `/api/v1/admin/*` |

> Secrets were printed in the seed output and shared separately — they are not
> committed to the repo. Production will layer mTLS + OAuth 2.1 client-credentials
> + request signing (domain config, §28).

## PayChain — live endpoints

```
POST /api/v1/paychain/funding-instructions          # create funding instruction
GET  /api/v1/paychain/funding-instructions/{id}
GET  /api/v1/paychain/reserves/{programId}/current   # eligible reserve + mint capacity
GET  /api/v1/paychain/reserves/{programId}/mint-capacity
POST /api/v1/paychain/mint-authorizations            # maker requests
GET  /api/v1/paychain/mint-authorizations/{id}
POST /api/v1/paychain/mint-authorizations/{id}/approve   # checker approves → SIGNED authorization
POST /api/v1/paychain/mint-authorizations/{id}/reject
POST /api/v1/paychain/mint-authorizations/{id}/revoke
POST /api/v1/paychain/mint-authorizations/{id}/confirm   # PayChain reports the blockchain mint
POST /api/v1/paychain/liability-snapshots            # PayChain submits signed liability feed
POST /api/v1/paychain/proof-of-reserve/{programId}/snapshots
```

Deposit clearance that increases mint capacity is done by the trustee bank via
`/api/v1/bank/deposits*` (trustee-bank credentials only) — PayChain does not call it.

## PayKH — live endpoints

```
POST /api/v1/paykh/tenants/{tenantId}/payment-profiles
GET  /api/v1/paykh/tenants/{tenantId}/payment-profiles
POST /api/v1/paykh/payment-profiles/{id}/verify|activate|suspend
POST /api/v1/paykh/payment-orders                    # returns unique KHQR reference
GET  /api/v1/paykh/payment-orders/{id}
POST /api/v1/paykh/payment-orders/{id}/check-payment # confirm bank txn (duplicate-safe)
POST /api/v1/paykh/program-funds                     # + /{id}/fund|reserve|release|balance
POST /api/v1/paykh/settlements                       # + /{id}/approve|confirm
```

## Signed webhooks (trustee → client)

Register your receiver URL (stored per client). The trustee platform delivers
signed events (Ed25519) with retries + dead-lettering. Each callback body is an
envelope with: `eventId, eventType, eventSequence, targetPlatform, timestamp,
clientId, programId, correlationId, requestId, nonce, bodyHash, signingKeyId,
signature, apiVersion, payload`.

Verify with the platform's **webhook** public key from
`/.well-known/trustee-signing-keys`: recompute `bodyHash = sha256(canonical(payload))`
and verify `signature` over the canonical subject. Consumers must be **idempotent
on `eventId`** (at-least-once delivery).

PayChain events: `funding.*`, `deposit.*`, `reserve.snapshot.created`,
`reserve.shortfall.detected`, `mint.authorization.approved|rejected|expired`,
`mint.confirmed`, `redemption.*`, `program.suspended`.
PayKH events: `paykh.payment.detected|confirmed|rejected|duplicate|refunded`,
`paykh.payment-profile.*`, `paykh.program-fund.*`, `paykh.settlement.*`,
`paykh.tenant.suspended`.

## Idempotency & correlation

Send `Idempotency-Key` on value-changing POSTs. Propagate a `correlationId` in
request bodies so a transaction is traceable across PayKH → Trustee → PayChain
and PayChain → Trustee → Bank.

## Amounts

All money is **integer minor units** as strings (e.g. `"100000"` = 1,000.00) plus
a 3-letter currency. Never floats.

## First integration test

Follow `docs/paychain-integration/end-to-end.md` (swap the `x-client-platform`
header shown there for the `X-Client-Id`/`X-Client-Secret` credentials above).
