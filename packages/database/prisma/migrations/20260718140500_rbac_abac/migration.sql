-- RBAC/ABAC administration (§8, §9) and emergency controls (§30).
ALTER TABLE "User" ADD COLUMN "attributes" JSONB;

CREATE TABLE "Role" (
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "institution" TEXT NOT NULL,
    "permissions" TEXT[],
    "builtin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("slug")
);
CREATE INDEX "Role_institution_idx" ON "Role"("institution");

CREATE TABLE "AbacPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "transactionType" TEXT NOT NULL,
    "minAmountMinor" BIGINT,
    "maxAmountMinor" BIGINT,
    "currency" TEXT,
    "riskLevel" TEXT,
    "programId" TEXT,
    "assetId" TEXT,
    "jurisdiction" TEXT,
    "requiredApprovals" INTEGER NOT NULL DEFAULT 2,
    "requiredRoles" TEXT[],
    "effect" TEXT NOT NULL DEFAULT 'REQUIRE',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AbacPolicy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AbacPolicy_transactionType_idx" ON "AbacPolicy"("transactionType");
CREATE INDEX "AbacPolicy_enabled_idx" ON "AbacPolicy"("enabled");

CREATE TABLE "PlatformControl" (
    "key" TEXT NOT NULL,
    "value" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "incidentRef" TEXT,
    "setBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformControl_pkey" PRIMARY KEY ("key")
);
