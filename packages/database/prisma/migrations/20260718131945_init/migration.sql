-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'EXPIRED', 'CLOSED');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'RESTRICTED', 'ON_HOLD', 'CLOSED');

-- CreateEnum
CREATE TYPE "FundingInstructionStatus" AS ENUM ('ISSUED', 'PARTIALLY_FUNDED', 'FUNDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('EXPECTED', 'DETECTED', 'UNMATCHED', 'MATCHED', 'PENDING_CLEARANCE', 'CLEARED', 'HELD', 'REJECTED', 'RETURNED', 'ALLOCATED_TO_RESERVE', 'AVAILABLE_FOR_MINT', 'CONSUMED_BY_MINT', 'REFUNDED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "MintAuthorizationStatus" AS ENUM ('DRAFT', 'PENDING_MAKER', 'PENDING_CHECKER', 'APPROVED', 'ISSUED', 'CONSUMED', 'EXPIRED', 'REVOKED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentProfileStatus" AS ENUM ('SUBMITTED', 'VERIFYING', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('CREATED', 'AWAITING_PAYMENT', 'PAYMENT_DETECTED', 'CONFIRMED', 'DUPLICATE', 'REJECTED', 'REFUNDED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('REQUESTED', 'APPROVED', 'SUBMITTED', 'CONFIRMED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "roles" TEXT[],
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Program" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "legalEntityId" TEXT NOT NULL,
    "issuerId" TEXT NOT NULL,
    "trusteeBankId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "referenceCurrency" TEXT NOT NULL,
    "legalModel" TEXT NOT NULL,
    "regulatoryStatus" TEXT NOT NULL,
    "reservePolicy" TEXT NOT NULL,
    "requiredRatioBps" INTEGER NOT NULL DEFAULT 10000,
    "safetyBufferBps" INTEGER NOT NULL DEFAULT 0,
    "agreementReferences" TEXT[],
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "status" "ProgramStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrusteeAccount" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "maskedAccountNumber" TEXT NOT NULL,
    "coreBankingRef" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "bankLegalEntity" TEXT NOT NULL,
    "branch" TEXT,
    "currency" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "supportedAssetId" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "balanceSource" TEXT NOT NULL,
    "integrationMode" TEXT NOT NULL,
    "minimumBalanceMinor" BIGINT NOT NULL DEFAULT 0,
    "requiredReserveBps" INTEGER NOT NULL DEFAULT 10000,
    "restricted" BOOLEAN NOT NULL DEFAULT false,
    "agreementReference" TEXT,
    "openedDate" TIMESTAMP(3),
    "closedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrusteeAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingInstruction" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "paychainRequestId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "depositor" TEXT NOT NULL,
    "expectedPayer" TEXT,
    "beneficiaryAccountId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "uniqueReference" TEXT NOT NULL,
    "permittedMethod" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "FundingInstructionStatus" NOT NULL DEFAULT 'ISSUED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FundingInstruction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "fundingInstructionId" TEXT,
    "trusteeAccountId" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "payerName" TEXT,
    "payerAccountMasked" TEXT,
    "originatingBank" TEXT,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentReference" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "status" "DepositStatus" NOT NULL DEFAULT 'DETECTED',
    "complianceResult" TEXT,
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "approvalRef" TEXT,
    "correlationId" TEXT,
    "reversalOf" TEXT,
    "totalDebitMinor" BIGINT NOT NULL,
    "totalCreditMinor" BIGINT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerPosting" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "debitMinor" BIGINT NOT NULL DEFAULT 0,
    "creditMinor" BIGINT NOT NULL DEFAULT 0,
    "memo" TEXT,

    CONSTRAINT "LedgerPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiabilitySnapshot" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "assetCode" TEXT NOT NULL,
    "blockchainNetwork" TEXT NOT NULL,
    "issuerAccount" TEXT NOT NULL,
    "circulatingMinor" BIGINT NOT NULL,
    "treasuryHeldMinor" BIGINT NOT NULL,
    "lockedMinor" BIGINT NOT NULL,
    "pendingMintMinor" BIGINT NOT NULL,
    "pendingBurnMinor" BIGINT NOT NULL,
    "pendingRedemptionMinor" BIGINT NOT NULL,
    "confirmedBurnMinor" BIGINT NOT NULL,
    "effectiveLiabilityMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "ledgerReference" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "sequence" BIGINT NOT NULL,
    "snapshotTimestamp" TIMESTAMP(3) NOT NULL,
    "signatureKeyId" TEXT NOT NULL,
    "signatureValue" TEXT NOT NULL,
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiabilitySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReserveSnapshot" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "referenceCurrency" TEXT NOT NULL,
    "eligibleReserveMinor" BIGINT NOT NULL,
    "excludedAmountMinor" BIGINT NOT NULL,
    "circulatingLiabilityMinor" BIGINT NOT NULL,
    "pendingRedemptionMinor" BIGINT NOT NULL,
    "requiredReserveMinor" BIGINT NOT NULL,
    "reserveRatioBps" INTEGER,
    "surplusMinor" BIGINT NOT NULL,
    "reconciliationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "dataSources" TEXT[],
    "signatureKeyId" TEXT NOT NULL,
    "signatureValue" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReserveSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MintAuthorization" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "paychainRequestId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "fundingDepositIds" TEXT[],
    "reserveAccountId" TEXT,
    "reserveSnapshotId" TEXT,
    "complianceCaseId" TEXT,
    "status" "MintAuthorizationStatus" NOT NULL DEFAULT 'PENDING_MAKER',
    "nonce" TEXT NOT NULL,
    "signingKeyId" TEXT,
    "signatureValue" TEXT,
    "maxMintAmountMinor" BIGINT NOT NULL,
    "singleUse" BOOLEAN NOT NULL DEFAULT true,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MintAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MintConfirmation" (
    "id" TEXT NOT NULL,
    "mintAuthorizationId" TEXT NOT NULL,
    "paychainTransactionId" TEXT NOT NULL,
    "blockchainTxHash" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "ledgerHeight" BIGINT,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "paychainSignature" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MintConfirmation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "mintAuthorizationId" TEXT,
    "makerId" TEXT NOT NULL,
    "makerActedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkerId" TEXT,
    "checkerActedAt" TIMESTAMP(3),
    "decision" "ApprovalDecision" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT,
    "beforeState" JSONB,
    "afterState" JSONB,
    "reason" TEXT,
    "approvalRef" TEXT,
    "ip" TEXT,
    "device" TEXT,
    "correlationId" TEXT,
    "sourceSystem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseCode" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "targetPlatform" TEXT NOT NULL DEFAULT 'PAYCHAIN',
    "sequence" BIGSERIAL NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureKeyId" TEXT NOT NULL,
    "signatureValue" TEXT NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "deadLettered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientApplication" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "oauthClientId" TEXT NOT NULL,
    "publicKeyPem" TEXT,
    "ipAllowlist" TEXT[],
    "webhookUrl" TEXT,
    "rateLimitPerMin" INTEGER NOT NULL DEFAULT 600,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiabilityRegistryEntry" (
    "id" TEXT NOT NULL,
    "trusteeProgramId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "tenantId" TEXT,
    "paykhProgramId" TEXT,
    "paychainAssetId" TEXT,
    "liabilityType" TEXT NOT NULL,
    "reserveAccountId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "requiredReserveBps" INTEGER NOT NULL DEFAULT 10000,
    "mintAuthorizationRequired" BOOLEAN NOT NULL DEFAULT true,
    "redemptionAuthorizationRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiabilityRegistryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaykhPaymentProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientAccountMasked" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "khqrPayload" TEXT NOT NULL,
    "status" "PaymentProfileStatus" NOT NULL DEFAULT 'SUBMITTED',
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaykhPaymentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaykhPaymentOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "paymentReference" TEXT NOT NULL,
    "khqrString" TEXT,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'CREATED',
    "matchedBankTransactionId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaykhPaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaykhProgramFund" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "paykhProgramId" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "reserveAccountId" TEXT NOT NULL,
    "fundedMinor" BIGINT NOT NULL DEFAULT 0,
    "reservedMinor" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaykhProgramFund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaykhSettlement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'REQUESTED',
    "approvedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaykhSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_institution_idx" ON "User"("institution");

-- CreateIndex
CREATE UNIQUE INDEX "Program_code_key" ON "Program"("code");

-- CreateIndex
CREATE INDEX "TrusteeAccount_programId_idx" ON "TrusteeAccount"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "FundingInstruction_paychainRequestId_key" ON "FundingInstruction"("paychainRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "FundingInstruction_uniqueReference_key" ON "FundingInstruction"("uniqueReference");

-- CreateIndex
CREATE INDEX "FundingInstruction_programId_idx" ON "FundingInstruction"("programId");

-- CreateIndex
CREATE INDEX "FundingInstruction_status_idx" ON "FundingInstruction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Deposit_bankTransactionId_key" ON "Deposit"("bankTransactionId");

-- CreateIndex
CREATE INDEX "Deposit_programId_idx" ON "Deposit"("programId");

-- CreateIndex
CREATE INDEX "Deposit_status_idx" ON "Deposit"("status");

-- CreateIndex
CREATE INDEX "Deposit_fundingInstructionId_idx" ON "Deposit"("fundingInstructionId");

-- CreateIndex
CREATE INDEX "LedgerEntry_programId_idx" ON "LedgerEntry"("programId");

-- CreateIndex
CREATE INDEX "LedgerEntry_source_idx" ON "LedgerEntry"("source");

-- CreateIndex
CREATE INDEX "LedgerPosting_entryId_idx" ON "LedgerPosting"("entryId");

-- CreateIndex
CREATE INDEX "LedgerPosting_account_idx" ON "LedgerPosting"("account");

-- CreateIndex
CREATE INDEX "LiabilitySnapshot_programId_idx" ON "LiabilitySnapshot"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "LiabilitySnapshot_programId_sequence_key" ON "LiabilitySnapshot"("programId", "sequence");

-- CreateIndex
CREATE INDEX "ReserveSnapshot_programId_idx" ON "ReserveSnapshot"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "MintAuthorization_paychainRequestId_key" ON "MintAuthorization"("paychainRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "MintAuthorization_nonce_key" ON "MintAuthorization"("nonce");

-- CreateIndex
CREATE INDEX "MintAuthorization_programId_idx" ON "MintAuthorization"("programId");

-- CreateIndex
CREATE INDEX "MintAuthorization_status_idx" ON "MintAuthorization"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MintConfirmation_mintAuthorizationId_key" ON "MintConfirmation"("mintAuthorizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_mintAuthorizationId_key" ON "Approval"("mintAuthorizationId");

-- CreateIndex
CREATE INDEX "AuditLog_subjectType_subjectId_idx" ON "AuditLog"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "IdempotencyKey_route_idx" ON "IdempotencyKey"("route");

-- CreateIndex
CREATE INDEX "OutboxEvent_eventType_idx" ON "OutboxEvent"("eventType");

-- CreateIndex
CREATE INDEX "OutboxEvent_targetPlatform_idx" ON "OutboxEvent"("targetPlatform");

-- CreateIndex
CREATE INDEX "OutboxEvent_deliveredAt_idx" ON "OutboxEvent"("deliveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClientApplication_platform_key" ON "ClientApplication"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "ClientApplication_oauthClientId_key" ON "ClientApplication"("oauthClientId");

-- CreateIndex
CREATE INDEX "LiabilityRegistryEntry_platform_idx" ON "LiabilityRegistryEntry"("platform");

-- CreateIndex
CREATE INDEX "LiabilityRegistryEntry_tenantId_idx" ON "LiabilityRegistryEntry"("tenantId");

-- CreateIndex
CREATE INDEX "LiabilityRegistryEntry_paychainAssetId_idx" ON "LiabilityRegistryEntry"("paychainAssetId");

-- CreateIndex
CREATE INDEX "PaykhPaymentProfile_tenantId_idx" ON "PaykhPaymentProfile"("tenantId");

-- CreateIndex
CREATE INDEX "PaykhPaymentProfile_status_idx" ON "PaykhPaymentProfile"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PaykhPaymentOrder_paymentReference_key" ON "PaykhPaymentOrder"("paymentReference");

-- CreateIndex
CREATE UNIQUE INDEX "PaykhPaymentOrder_matchedBankTransactionId_key" ON "PaykhPaymentOrder"("matchedBankTransactionId");

-- CreateIndex
CREATE INDEX "PaykhPaymentOrder_tenantId_idx" ON "PaykhPaymentOrder"("tenantId");

-- CreateIndex
CREATE INDEX "PaykhPaymentOrder_status_idx" ON "PaykhPaymentOrder"("status");

-- CreateIndex
CREATE INDEX "PaykhProgramFund_tenantId_idx" ON "PaykhProgramFund"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PaykhProgramFund_tenantId_paykhProgramId_key" ON "PaykhProgramFund"("tenantId", "paykhProgramId");

-- CreateIndex
CREATE INDEX "PaykhSettlement_tenantId_idx" ON "PaykhSettlement"("tenantId");

-- CreateIndex
CREATE INDEX "PaykhSettlement_status_idx" ON "PaykhSettlement"("status");

-- AddForeignKey
ALTER TABLE "TrusteeAccount" ADD CONSTRAINT "TrusteeAccount_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingInstruction" ADD CONSTRAINT "FundingInstruction_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_fundingInstructionId_fkey" FOREIGN KEY ("fundingInstructionId") REFERENCES "FundingInstruction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_trusteeAccountId_fkey" FOREIGN KEY ("trusteeAccountId") REFERENCES "TrusteeAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerPosting" ADD CONSTRAINT "LedgerPosting_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiabilitySnapshot" ADD CONSTRAINT "LiabilitySnapshot_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReserveSnapshot" ADD CONSTRAINT "ReserveSnapshot_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MintAuthorization" ADD CONSTRAINT "MintAuthorization_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MintConfirmation" ADD CONSTRAINT "MintConfirmation_mintAuthorizationId_fkey" FOREIGN KEY ("mintAuthorizationId") REFERENCES "MintAuthorization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_mintAuthorizationId_fkey" FOREIGN KEY ("mintAuthorizationId") REFERENCES "MintAuthorization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_makerId_fkey" FOREIGN KEY ("makerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_checkerId_fkey" FOREIGN KEY ("checkerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaykhPaymentOrder" ADD CONSTRAINT "PaykhPaymentOrder_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PaykhPaymentProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
