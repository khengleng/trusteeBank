-- PayKH merchant registry mirror (update §25). PayKH is the system of record for
-- merchant onboarding/KYC; this table mirrors what PayKH registers/reports and is
-- used by the trustee for settlement/redemption referential integrity.

-- CreateTable
CREATE TABLE "PaykhMerchant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "merchantCode" TEXT NOT NULL,
    "paykhMerchantRef" TEXT,
    "legalName" TEXT NOT NULL,
    "country" TEXT,
    "kycStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "riskLevel" TEXT NOT NULL DEFAULT 'LOW',
    "source" TEXT NOT NULL DEFAULT 'PAYKH',
    "lastReportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaykhMerchant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaykhMerchant_tenantId_merchantCode_key" ON "PaykhMerchant"("tenantId", "merchantCode");

-- CreateIndex
CREATE INDEX "PaykhMerchant_tenantId_idx" ON "PaykhMerchant"("tenantId");

-- CreateIndex
CREATE INDEX "PaykhMerchant_status_idx" ON "PaykhMerchant"("status");
