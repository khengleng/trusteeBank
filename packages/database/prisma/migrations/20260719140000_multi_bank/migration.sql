-- Multi-bank reserve integration (update §26): the trustee holds reserves across
-- many banks. BankConnection describes each bank; TrusteeAccount links to one.

-- CreateTable
CREATE TABLE "BankConnection" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "bankLegalName" TEXT NOT NULL,
    "country" TEXT,
    "integrationMode" TEXT NOT NULL DEFAULT 'MOCK',
    "baseUrl" TEXT,
    "authTokenEnv" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankConnection_bankId_key" ON "BankConnection"("bankId");

-- AlterTable
ALTER TABLE "TrusteeAccount" ADD COLUMN "bankId" TEXT;
ALTER TABLE "TrusteeAccount" ADD COLUMN "mockClearedMinor" BIGINT NOT NULL DEFAULT 0;
