# Railway Deployment Guide

Railway is the **required** deployment platform for the Cambobia Trustee Banking
Platform (trusteebankpromptupdate §5). This guide covers the pilot/UAT setup and
the guardrails for production.

## Projects & environments

Create a dedicated Railway project `trustee-production`, kept separate from the
existing `paychain-production` and `paykh-production` projects
(changeforpaychainandpaykh §9). Within it, use strongly isolated environments:

```
trustee-development
trustee-testing
trustee-uat
trustee-production
trustee-disaster-recovery
```

Production must **not** share databases, credentials, buckets or signing keys
with development or UAT (update §5).

## Services

| Railway service            | Source root            | Ingress | Custom domain                       |
|----------------------------|------------------------|---------|-------------------------------------|
| `trustee-api-gateway`      | `apps/trustee-api`     | public  | `api.trustee.cambobia.com`          |
| `trustee-webhook-worker`   | `apps/trustee-worker`  | private | — (private networking only)         |
| `trustee-postgres`         | Railway Postgres plugin| private | —                                   |
| `trustee-redis`            | Railway Redis plugin   | private | —                                   |
| `trustee-*-portal`         | (portal apps, future)  | public  | `ops./treasury./compliance./audit.` |
| `trustee-status-service`   | (status, future)       | public  | `status.trustee.cambobia.com`       |

Each app carries its own `railway.json` (Dockerfile build, health check, restart
policy). Only the API gateway and portals may have public ingress; Postgres,
Redis and workers use **private networking** only (domain config §7).

## Setup steps

1. **Create the project** `trustee-production` and add the **PostgreSQL** and
   **Redis** plugins. They expose `DATABASE_URL` / `REDIS_URL` on the private
   network.
2. **Add the API service** from `apps/trustee-api` (Dockerfile builder — Railway
   reads `apps/trustee-api/railway.json`). Set variables from
   [`.env.example`](../../.env.example), referencing the plugins, e.g.
   `DATABASE_URL=${{ Postgres.DATABASE_URL }}`.
3. **Add the worker service** from `apps/trustee-worker`. Same `DATABASE_URL`; no
   public domain.
4. **Custom domains**: attach `api.trustee.cambobia.com` to the API gateway and
   the portal domains to their services.
5. **Migrations**: the API start command runs `prisma migrate deploy` (never the
   destructive `migrate dev`). Production migrations require an approved plan and
   change ticket (update §26).
6. **Seed** (dev/UAT only): run `npm run db:seed` — feature flags, demo program,
   client-app registrations. Contains no real funds.

## Secrets (update §27)

Store secrets as Railway environment variables or an approved external secret
manager. Use **separate** secrets for PayKH API, PayChain API, bank integration,
database, Redis, webhook signing, mint-authorization signing, reserve-snapshot
signing, compliance providers and evidence storage. Never store private keys in
the repo. High-value signing keys should live in an external KMS/HSM/bank signing
service; Railway receives signing *results*, not exportable master keys.

## Reliability (update §25)

Health checks (`/health`), graceful shutdown (SIGTERM), `ON_FAILURE` restart,
horizontal scaling for the stateless API (`numReplicas: 2`), worker retries with
a dead-letter threshold, connection pooling, and scheduled/off-platform backups.
Do not use mounted application volumes as the only data-protection strategy.

## Production gate

`production.real-funds.enabled` and `production.automatic-approval.enabled`
default to `false`. Do not enable real-money production until every item in
[docs/regulatory/production-activation-checklist.md](../regulatory/production-activation-checklist.md)
is complete, including the Railway vendor-risk assessment (update §8/§32). A
hosting certification does not by itself make the application compliant.
