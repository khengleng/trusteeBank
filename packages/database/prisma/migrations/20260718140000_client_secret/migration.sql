-- Add hashed client API secret for per-client authentication (update §3, §8).
ALTER TABLE "ClientApplication" ADD COLUMN "clientSecretHash" TEXT;
