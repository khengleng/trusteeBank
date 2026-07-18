-- Request signing opt-in (§28), replay-prevention nonce store, reconciliation, attestations.
ALTER TABLE "ClientApplication" ADD COLUMN "requireSignature" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "NonceUsage" (
    "nonce" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NonceUsage_pkey" PRIMARY KEY ("nonce")
);
CREATE INDEX "NonceUsage_expiresAt_idx" ON "NonceUsage"("expiresAt");

CREATE TABLE "ReconciliationRun" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "programId" TEXT,
    "tenantId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "summary" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReconciliationRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReconciliationRun_scope_idx" ON "ReconciliationRun"("scope");

CREATE TABLE "ReconciliationException" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "detail" JSONB,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReconciliationException_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReconciliationException_runId_idx" ON "ReconciliationException"("runId");
CREATE INDEX "ReconciliationException_resolved_idx" ON "ReconciliationException"("resolved");
ALTER TABLE "ReconciliationException" ADD CONSTRAINT "ReconciliationException_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ReconciliationRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Attestation" (
    "id" TEXT NOT NULL,
    "programId" TEXT,
    "period" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "methodology" TEXT,
    "reserveAmountMinor" BIGINT,
    "liabilityAmountMinor" BIGINT,
    "currency" TEXT,
    "opinion" TEXT,
    "auditor" TEXT NOT NULL,
    "documentHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "createdBy" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Attestation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Attestation_programId_idx" ON "Attestation"("programId");
CREATE INDEX "Attestation_status_idx" ON "Attestation"("status");
