-- Reserve adjustments (update §16): eligible-reserve deductions (regulatory
-- holds, restricted funds, operational carve-outs, bank charges).

-- CreateTable
CREATE TABLE "ReserveAdjustment" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountMinor" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "liftedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReserveAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReserveAdjustment_programId_active_idx" ON "ReserveAdjustment"("programId", "active");
