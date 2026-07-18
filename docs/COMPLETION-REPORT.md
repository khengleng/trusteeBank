# Completion Report — Cambobia Trustee Banking Platform

## Summary

A standalone, regulated **trustee banking & reserve platform** for
`trustee.cambobia.com` that integrates with the existing PayChain and PayKH
systems via signed APIs and webhooks. Built as an npm-workspace modular monolith
in strict TypeScript (no `any`), **deployed live on Railway**.

## Live deployment (Railway project `trustee-Bank`)

| Service | Status | Notes |
|---------|--------|-------|
| `trustee-api-gateway` | RUNNING | Live: https://trustee-api-gateway-production.up.railway.app — `/health` → `{"status":"ok","db":true}` |
| `trustee-webhook-worker` | RUNNING | Signed-event delivery loop active (private, no ingress) |
| `Postgres` | RUNNING | Migrations applied (`migrate deploy` on boot) |
| `Redis` | RUNNING | Queues/locks (provisioned) |

- Custom domain **`api.trustee.cambobia.com`** attached (Sync ACTIVE). To resolve,
  add at your DNS provider: `CNAME api.trustee → qg54uu67.up.railway.app` and
  `TXT _railway-verify.api.trustee → railway-verify=7f8097fcb1a11514a807d8ac173dbf24849b2d0d3f8580748c1fcedf1824f75a`.
- High-risk flags verified **disabled** in production: `production.real-funds.enabled=false`,
  `production.automatic-approval.enabled=false`; minting is maker-checker only.

## Features completed

- **Domain packages (pure, unit-tested — 53 tests passing):** money (bigint minor
  units), enums, fund-classification engine, immutable double-entry ledger, reserve
  calculation + mint capacity + mint guard, Ed25519 signing/canonicalization/hashing.
- **PayChain API** (`/api/v1/paychain`): funding instructions, reserve position &
  mint capacity, PayChain liability-snapshot intake with signature verification,
  maker-checker signed mint authorization, mint confirmation, proof-of-reserve.
- **PayKH API** (`/api/v1/paykh`): tenant payment profiles, KHQR payment orders +
  duplicate-safe bank matching, program-fund safeguarding, merchant settlement.
- **Bank API** (`/api/v1/bank`): trustee-bank-only deposit detection/matching/clearance.
- **Cross-cutting:** client-separation guard, idempotency, append-only audit trail,
  feature flags, transactional signed-event outbox + delivery worker, adapters
  (PayChain/PayKH/bank/KHQR/compliance), env-based config with strict validation,
  CORS allowlist, Swagger.

## APIs implemented

40 routes across `/api/v1/paychain`, `/api/v1/paykh`, `/api/v1/bank`,
`/api/v1/trustee`, plus `/health` and `/.well-known/trustee-signing-keys`.

## Reserve & mint model

Double-entry: deposit detected (`Dr CASH / Cr UNMATCHED`), cleared (`→ RESERVE_OBLIGATION`),
mint authorized (`→ PENDING_MINT`, capacity earmarked), confirmed (`→ realized`).
`Eligible Reserve` and `Mint Capacity` computed live; guard blocks on insufficient
capacity, stale liability feed, unresolved reconciliation, compliance hold,
uncleared deposits, incomplete approval, or disabled feature.

## Verification performed

- **53 unit tests** pass (money, ledger, reserve/guard, crypto, signed envelope).
- **Live end-to-end against real Postgres** — both acceptance paths:
  - PayChain (§31): funding → deposit cleared → reserve↑ → maker/checker signed
    mint → over-mint blocked (`INSUFFICIENT_CAPACITY`) → confirm → single-use
    double-confirm blocked → snapshot; ledger nets to zero.
  - PayKH (§30): profile → order+KHQR → bank match confirmed → duplicate bankTx
    rejected (409) → signed `paykh.payment.confirmed`; ledger nets to zero.
  - Segregation of duties (self-approval → 403) and client separation (wrong/missing
    client header → 403) enforced.

## Bugs found & fixed during live testing

1. Ledger rejected negative postings used to reverse mint reservations → added a
   positive-amount `mintReleaseEntry` for confirm/revoke/expire.
2. Mint guard recomputed capacity without subtracting earmarked pending mints
   (double-spend risk) → guard now uses the live `mintCapacity`.
3. PayKH profile DTO required `tenantId` in body while it comes from the path → 422.
4. `LedgerEntry.programId` was a hard FK to `Program`, breaking PayKH (tenant-scoped)
   entries → relaxed to a plain scope field.
5. Deploy blockers: invalid root `railway.toml` schema (moved to docs), and Prisma
   needing OpenSSL on Alpine (added to Dockerfiles), and PORT/domain mismatch (pinned).

## Known limitations / deferred (pilot scope)

- Redemption, reconciliation engine, compliance orchestration, attestations,
  reporting, and the operations/treasury/compliance/audit **portals** are scaffolded
  in the repo structure but not implemented in this pilot slice.
- Bank/KHQR/compliance adapters run in **pilot/manual mode** (no real core-banking).
- Signing keys are ephemeral in-memory for the pilot; production must use KMS/HSM (§38).
- Auth is client-separation-by-header for the pilot; production requires mTLS + OAuth
  2.1 client credentials + request signing per client.

## Production activation

Blocked by design until the checklist in
`docs/regulatory/production-activation-checklist.md` is complete (bank sign-off,
legal/regulatory approval, Railway vendor-risk assessment, pen test, DR test,
core-banking integration). `production.real-funds.enabled` stays `false`.
