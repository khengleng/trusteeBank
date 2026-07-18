-- Redemption & payout (§20, §21).
CREATE TYPE "RedemptionStatus" AS ENUM (
  'REQUESTED','VALIDATING','COMPLIANCE_REVIEW','AWAITING_APPROVAL','APPROVED',
  'ASSET_LOCK_PENDING','ASSET_LOCKED','BURN_PENDING','BURN_CONFIRMED',
  'PAYOUT_PENDING','PAYOUT_SUBMITTED','PAYOUT_CONFIRMED','COMPLETED',
  'REJECTED','FAILED','RETURNED','MANUAL_REVIEW'
);

CREATE TABLE "Redemption" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "paychainRedemptionId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "beneficiaryName" TEXT NOT NULL,
    "beneficiaryAccountMasked" TEXT NOT NULL,
    "status" "RedemptionStatus" NOT NULL DEFAULT 'REQUESTED',
    "correlationId" TEXT,
    "burnTxHash" TEXT,
    "burnConfirmedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "payoutReference" TEXT,
    "payoutSubmittedAt" TIMESTAMP(3),
    "payoutConfirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Redemption_paychainRedemptionId_key" ON "Redemption"("paychainRedemptionId");
CREATE INDEX "Redemption_programId_idx" ON "Redemption"("programId");
CREATE INDEX "Redemption_status_idx" ON "Redemption"("status");
