# Cambobia Trustee Banking Platform

**Safeguarding, reserve control and financial assurance for PayChain and PayKH.**

A standalone, regulated trustee-banking and reserve-management platform hosted at
`trustee.cambobia.com`. It is the authoritative institutional layer that decides
**whether real bank money exists, is cleared, is safeguarded, and may legally
back a requested financial action** — while PayChain decides *how* digital value
is issued and PayKH decides *why* value should move (§33 of the platform spec).

PayChain (`paychain.cambobia.com`) and PayKH (`paykh.cambobia.com`) are existing,
already-deployed systems. This platform integrates with them through versioned
APIs and signed webhooks — **never** shared databases.

## Deployment

**Railway is the required deployment platform.** See
[docs/deployment/railway.md](docs/deployment/railway.md). Production with real
regulated funds additionally requires trustee-bank sign-off and the
production-activation checklist (`production.real-funds.enabled` defaults `false`).

## Monorepo layout

```
packages/
  domain/          Money (bigint minor units), enums, fund-classification engine
  ledger/          Immutable double-entry journal engine + entry templates
  reserves/        Reserve calculation, mint capacity, mint guard (pure)
  cryptography/    Ed25519 signing, canonicalization, hashing
  adapters/        PayChain/PayKH/bank/KHQR/compliance adapters + signed envelope
  database/        Prisma schema, client, seed
apps/
  trustee-api/     NestJS API — /api/v1/paychain, /api/v1/paykh, /api/v1/bank
  trustee-worker/  Signed-webhook delivery worker (outbox → clients)
docs/              Architecture, regulatory, deployment, integration
```

## Quick start (local)

```bash
npm install
npm run db:generate
# start Postgres, set DATABASE_URL (see .env.example), then:
npm run db:deploy && npm run db:seed
npm run api:dev            # http://localhost:3000  (Swagger at /docs)
```

## Verify

```bash
npm run build              # all packages + apps
npm test                   # domain, ledger, reserves, crypto, adapters unit tests
```

## Core guarantees (non-negotiable, §49)

- No mint without cleared reserve; never against screenshots/receipts/pending funds.
- Mint authorizations are single-use, amount/asset/program-bound, time-limited, signed.
- A user never approves their own request (maker-checker, §9).
- Financial entries are append-only; corrections via compensating entries only.
- One bank transaction can satisfy at most one PayKH payment order (duplicate-safe).
- High-risk features default disabled; automatic approval is never on by default.
