-- Inner signed artifacts for authorization/evidence events (trustee-events-contract).
ALTER TABLE "MintAuthorization" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "MintAuthorization" ADD COLUMN "destination" TEXT;
ALTER TABLE "OutboxEvent" ADD COLUMN "artifact" TEXT;
