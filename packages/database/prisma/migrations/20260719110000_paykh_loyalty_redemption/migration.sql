-- PayKH backed loyalty stablecoin: outstanding liability, issuance and
-- redemption (the "swap") records (update §23). Mirrors on-chain (Stellar)
-- circulating supply and links redemption to merchant settlement.

-- CreateTable
CREATE TABLE "PaykhLoyaltyLiability" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paykhProgramId" TEXT NOT NULL,
    "programFundId" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "pegCurrency" TEXT NOT NULL,
    "denominationMinor" BIGINT NOT NULL DEFAULT 1,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "stellarAssetCode" TEXT,
    "stellarIssuer" TEXT,
    "stellarDistributor" TEXT,
    "outstandingMinor" BIGINT NOT NULL DEFAULT 0,
    "issuedTotalMinor" BIGINT NOT NULL DEFAULT 0,
    "redeemedTotalMinor" BIGINT NOT NULL DEFAULT 0,
    "onChainSupplyMinor" BIGINT NOT NULL DEFAULT 0,
    "reconciliationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "lastReconciledAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaykhLoyaltyLiability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaykhLoyaltyIssuance" (
    "id" TEXT NOT NULL,
    "loyaltyLiabilityId" TEXT NOT NULL,
    "customerRef" TEXT NOT NULL,
    "units" BIGINT,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "paychainReference" TEXT,
    "onChainTxHash" TEXT,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaykhLoyaltyIssuance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaykhLoyaltyRedemption" (
    "id" TEXT NOT NULL,
    "loyaltyLiabilityId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "customerRef" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "settlementId" TEXT,
    "paychainReference" TEXT,
    "onChainTxHash" TEXT,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "PaykhLoyaltyRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaykhLoyaltyLiability_programFundId_key" ON "PaykhLoyaltyLiability"("programFundId");

-- CreateIndex
CREATE UNIQUE INDEX "PaykhLoyaltyLiability_tenantId_paykhProgramId_key" ON "PaykhLoyaltyLiability"("tenantId", "paykhProgramId");

-- CreateIndex
CREATE INDEX "PaykhLoyaltyLiability_tenantId_idx" ON "PaykhLoyaltyLiability"("tenantId");

-- CreateIndex
CREATE INDEX "PaykhLoyaltyIssuance_loyaltyLiabilityId_idx" ON "PaykhLoyaltyIssuance"("loyaltyLiabilityId");

-- CreateIndex
CREATE INDEX "PaykhLoyaltyRedemption_loyaltyLiabilityId_idx" ON "PaykhLoyaltyRedemption"("loyaltyLiabilityId");

-- CreateIndex
CREATE INDEX "PaykhLoyaltyRedemption_tenantId_idx" ON "PaykhLoyaltyRedemption"("tenantId");

-- CreateIndex
CREATE INDEX "PaykhLoyaltyRedemption_status_idx" ON "PaykhLoyaltyRedemption"("status");

-- AddForeignKey
ALTER TABLE "PaykhLoyaltyLiability" ADD CONSTRAINT "PaykhLoyaltyLiability_programFundId_fkey" FOREIGN KEY ("programFundId") REFERENCES "PaykhProgramFund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaykhLoyaltyIssuance" ADD CONSTRAINT "PaykhLoyaltyIssuance_loyaltyLiabilityId_fkey" FOREIGN KEY ("loyaltyLiabilityId") REFERENCES "PaykhLoyaltyLiability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaykhLoyaltyRedemption" ADD CONSTRAINT "PaykhLoyaltyRedemption_loyaltyLiabilityId_fkey" FOREIGN KEY ("loyaltyLiabilityId") REFERENCES "PaykhLoyaltyLiability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
