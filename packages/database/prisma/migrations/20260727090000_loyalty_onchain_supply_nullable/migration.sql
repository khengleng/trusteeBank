-- Drift honesty (§24/§49): the on-chain circulating supply is NULL until a figure
-- has actually been read from Horizon. Previously an unreadable chain stored the
-- ledger value in this column and reported status OK, which asserted a
-- reconciliation that had never been performed.
--
-- Existing rows: a row that was never reconciled (status PENDING) had a
-- placeholder 0; rows reconciled while the chain was unreadable hold a copy of
-- the ledger figure. Neither is an observation, so both are reset to NULL and
-- re-derived on the next reconcile.

ALTER TABLE "PaykhLoyaltyLiability" ALTER COLUMN "onChainSupplyMinor" DROP NOT NULL;
ALTER TABLE "PaykhLoyaltyLiability" ALTER COLUMN "onChainSupplyMinor" DROP DEFAULT;

UPDATE "PaykhLoyaltyLiability"
   SET "onChainSupplyMinor" = NULL,
       "reconciliationStatus" = CASE
         WHEN "reconciliationStatus" = 'OK' THEN 'UNVERIFIED'
         ELSE "reconciliationStatus"
       END
 WHERE "stellarAssetCode" IS NULL
    OR "stellarIssuer" IS NULL
    OR "lastReconciledAt" IS NULL;
