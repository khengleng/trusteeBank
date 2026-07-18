# Cambobia Trustee Banking Platform — Railway topology (required infra).
#
# Railway is the required deployment platform (trusteebankpromptupdate §5).
# This file documents the intended service map for the `trustee-production`
# Railway project. Each app has its own railway.json used when that service's
# root is deployed. PayChain and PayKH remain in their OWN Railway projects and
# databases — integration is API + signed webhooks only (changeforpaychainandpaykh
# §9/§13).
#
# ─ Public ingress (custom domains) ────────────────────────────────────────────
#   api.trustee.cambobia.com        → trustee-api-gateway   (apps/trustee-api)
#   trustee.cambobia.com            → trustee-main-portal   (apps/trustee-operations-portal or landing)
#   ops.trustee.cambobia.com        → trustee-operations-portal
#   treasury.trustee.cambobia.com   → trustee-treasury-portal
#   compliance.trustee.cambobia.com → trustee-compliance-portal
#   audit.trustee.cambobia.com      → trustee-audit-portal
#   status.trustee.cambobia.com     → trustee-status-service
#
# ─ Private networking only (NO public domain) ────────────────────────────────
#   trustee-postgres        (Railway PostgreSQL plugin / external managed PG)
#   trustee-redis           (Railway Redis plugin)
#   trustee-webhook-worker  (apps/trustee-worker)
#   trustee-reconciliation-worker, trustee-reporting-worker, trustee-scheduler
#     (future workers; run from apps/trustee-worker with a MODE env, or split out)
#
# Only the API gateway and portals may have public ingress (domain config §7).
# Postgres/Redis/worker ports must never be publicly exposed.

[environments]
# Strongly isolated environments — production shares NO db/keys/buckets with the
# rest (trusteebankpromptupdate §5).
list = [
  "trustee-development",
  "trustee-testing",
  "trustee-uat",
  "trustee-production",
  "trustee-disaster-recovery",
]

[services.trustee-api-gateway]
root = "apps/trustee-api"
public = true
domain = "api.trustee.cambobia.com"

[services.trustee-webhook-worker]
root = "apps/trustee-worker"
public = false
