/**
 * Mint authorization guard (§17 "Never issue a mint authorization if …",
 * §49 non-negotiable rules).
 *
 * A pure decision function: given the current facts, it returns whether a mint
 * of `requested` may proceed and, if not, every blocking reason. The service
 * layer gathers the facts (reserve snapshot, feature flags, compliance, clock)
 * and passes them in. Failing safe is the default — any unmet precondition
 * blocks the mint (§39, §49 "When uncertain: stop minting").
 */

import { gte, isPositive, type Money } from '@trustee/domain';
import { mintCapacity, type MintCapacityInput } from './reserve-calculation';

export const MintBlockReason = {
  INSUFFICIENT_CAPACITY: 'INSUFFICIENT_CAPACITY',
  RESERVE_DATA_STALE: 'RESERVE_DATA_STALE',
  BANK_CONNECTIVITY_UNAVAILABLE: 'BANK_CONNECTIVITY_UNAVAILABLE',
  RECONCILIATION_UNRESOLVED: 'RECONCILIATION_UNRESOLVED',
  COMPLIANCE_HOLD: 'COMPLIANCE_HOLD',
  ASSET_MINTING_SUSPENDED: 'ASSET_MINTING_SUSPENDED',
  PROGRAM_SUSPENDED: 'PROGRAM_SUSPENDED',
  ACCOUNT_RESTRICTED: 'ACCOUNT_RESTRICTED',
  DEPOSIT_NOT_CLEARED: 'DEPOSIT_NOT_CLEARED',
  APPROVAL_INCOMPLETE: 'APPROVAL_INCOMPLETE',
  LIABILITY_FEED_STALE: 'LIABILITY_FEED_STALE',
  PROOF_OF_RESERVE_EXPIRED: 'PROOF_OF_RESERVE_EXPIRED',
  MINT_FEATURE_DISABLED: 'MINT_FEATURE_DISABLED',
  NON_POSITIVE_AMOUNT: 'NON_POSITIVE_AMOUNT',
  CURRENCY_MISMATCH: 'CURRENCY_MISMATCH',
} as const;
export type MintBlockReason =
  (typeof MintBlockReason)[keyof typeof MintBlockReason];

export interface MintGuardFacts {
  readonly requested: Money;
  readonly capacityInput: MintCapacityInput;
  /** Age of the reserve snapshot vs the maximum tolerated, in seconds. */
  readonly reserveSnapshotAgeSeconds: number;
  readonly maxReserveSnapshotAgeSeconds: number;
  /** Age of the last successful bank connectivity check, in seconds. */
  readonly bankConnectivityAgeSeconds: number;
  readonly maxBankConnectivityAgeSeconds: number;
  /** Age of the PayChain liability feed snapshot, in seconds. */
  readonly liabilityFeedAgeSeconds: number;
  readonly maxLiabilityFeedAgeSeconds: number;
  /** Age of the current proof-of-reserve, in seconds; null if not required. */
  readonly proofOfReserveAgeSeconds: number | null;
  readonly maxProofOfReserveAgeSeconds: number | null;
  readonly hasUnresolvedReconciliation: boolean;
  readonly complianceHoldActive: boolean;
  readonly assetMintingSuspended: boolean;
  readonly programSuspended: boolean;
  readonly accountRestricted: boolean;
  readonly fundingDepositsCleared: boolean;
  readonly makerCheckerComplete: boolean;
  readonly mintFeatureEnabled: boolean;
}

export interface MintGuardDecision {
  readonly allowed: boolean;
  readonly reasons: readonly MintBlockReason[];
  readonly capacity: Money;
}

export function evaluateMintGuard(facts: MintGuardFacts): MintGuardDecision {
  const reasons: MintBlockReason[] = [];
  const capacity = mintCapacity(facts.capacityInput);

  if (!facts.mintFeatureEnabled) reasons.push(MintBlockReason.MINT_FEATURE_DISABLED);

  if (!isPositive(facts.requested)) {
    reasons.push(MintBlockReason.NON_POSITIVE_AMOUNT);
  } else if (facts.requested.currency !== capacity.currency) {
    reasons.push(MintBlockReason.CURRENCY_MISMATCH);
  } else if (!gte(capacity, facts.requested)) {
    reasons.push(MintBlockReason.INSUFFICIENT_CAPACITY);
  }

  if (facts.reserveSnapshotAgeSeconds > facts.maxReserveSnapshotAgeSeconds) {
    reasons.push(MintBlockReason.RESERVE_DATA_STALE);
  }
  if (facts.bankConnectivityAgeSeconds > facts.maxBankConnectivityAgeSeconds) {
    reasons.push(MintBlockReason.BANK_CONNECTIVITY_UNAVAILABLE);
  }
  if (facts.liabilityFeedAgeSeconds > facts.maxLiabilityFeedAgeSeconds) {
    reasons.push(MintBlockReason.LIABILITY_FEED_STALE);
  }
  if (
    facts.maxProofOfReserveAgeSeconds !== null &&
    (facts.proofOfReserveAgeSeconds === null ||
      facts.proofOfReserveAgeSeconds > facts.maxProofOfReserveAgeSeconds)
  ) {
    reasons.push(MintBlockReason.PROOF_OF_RESERVE_EXPIRED);
  }
  if (facts.hasUnresolvedReconciliation) {
    reasons.push(MintBlockReason.RECONCILIATION_UNRESOLVED);
  }
  if (facts.complianceHoldActive) reasons.push(MintBlockReason.COMPLIANCE_HOLD);
  if (facts.assetMintingSuspended) {
    reasons.push(MintBlockReason.ASSET_MINTING_SUSPENDED);
  }
  if (facts.programSuspended) reasons.push(MintBlockReason.PROGRAM_SUSPENDED);
  if (facts.accountRestricted) reasons.push(MintBlockReason.ACCOUNT_RESTRICTED);
  if (!facts.fundingDepositsCleared) {
    reasons.push(MintBlockReason.DEPOSIT_NOT_CLEARED);
  }
  if (!facts.makerCheckerComplete) reasons.push(MintBlockReason.APPROVAL_INCOMPLETE);

  return { allowed: reasons.length === 0, reasons, capacity };
}
