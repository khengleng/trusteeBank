import { describe, it, expect } from 'vitest';
import { money } from '@trustee/domain';
import { evaluateMintGuard, MintBlockReason, type MintGuardFacts } from './mint-guard';

const USD = 'USD';
const m = (v: bigint) => money(v, USD);

/** A baseline set of facts under which a mint is fully permitted. */
function okFacts(overrides: Partial<MintGuardFacts> = {}): MintGuardFacts {
  return {
    requested: m(100_00n),
    capacityInput: {
      currency: USD,
      eligibleReserve: m(1_000_00n),
      existingReserveObligation: m(500_00n),
      requiredSafetyBuffer: m(0n),
      pendingMintAuthorizations: m(0n),
    },
    reserveSnapshotAgeSeconds: 10,
    maxReserveSnapshotAgeSeconds: 300,
    bankConnectivityAgeSeconds: 5,
    maxBankConnectivityAgeSeconds: 120,
    liabilityFeedAgeSeconds: 20,
    maxLiabilityFeedAgeSeconds: 600,
    proofOfReserveAgeSeconds: 100,
    maxProofOfReserveAgeSeconds: 86400,
    hasUnresolvedReconciliation: false,
    complianceHoldActive: false,
    assetMintingSuspended: false,
    programSuspended: false,
    accountRestricted: false,
    fundingDepositsCleared: true,
    makerCheckerComplete: true,
    mintFeatureEnabled: true,
    ...overrides,
  };
}

describe('evaluateMintGuard', () => {
  it('allows a well-formed, fully-backed, approved mint', () => {
    const d = evaluateMintGuard(okFacts());
    expect(d.allowed).toBe(true);
    expect(d.reasons).toHaveLength(0);
    expect(d.capacity.minor).toBe(500_00n);
  });

  it('blocks when capacity is insufficient', () => {
    const d = evaluateMintGuard(okFacts({ requested: m(600_00n) }));
    expect(d.allowed).toBe(false);
    expect(d.reasons).toContain(MintBlockReason.INSUFFICIENT_CAPACITY);
  });

  it('blocks a non-positive amount', () => {
    const d = evaluateMintGuard(okFacts({ requested: m(0n) }));
    expect(d.reasons).toContain(MintBlockReason.NON_POSITIVE_AMOUNT);
  });

  it('blocks on stale reserve snapshot', () => {
    const d = evaluateMintGuard(okFacts({ reserveSnapshotAgeSeconds: 999 }));
    expect(d.reasons).toContain(MintBlockReason.RESERVE_DATA_STALE);
  });

  it('blocks on stale liability feed', () => {
    const d = evaluateMintGuard(okFacts({ liabilityFeedAgeSeconds: 99999 }));
    expect(d.reasons).toContain(MintBlockReason.LIABILITY_FEED_STALE);
  });

  it('blocks on bank connectivity beyond tolerance', () => {
    const d = evaluateMintGuard(okFacts({ bankConnectivityAgeSeconds: 9999 }));
    expect(d.reasons).toContain(MintBlockReason.BANK_CONNECTIVITY_UNAVAILABLE);
  });

  it('blocks on missing proof-of-reserve when required', () => {
    const d = evaluateMintGuard(okFacts({ proofOfReserveAgeSeconds: null }));
    expect(d.reasons).toContain(MintBlockReason.PROOF_OF_RESERVE_EXPIRED);
  });

  it('does not require proof-of-reserve when not configured', () => {
    const d = evaluateMintGuard(
      okFacts({ proofOfReserveAgeSeconds: null, maxProofOfReserveAgeSeconds: null }),
    );
    expect(d.reasons).not.toContain(MintBlockReason.PROOF_OF_RESERVE_EXPIRED);
    expect(d.allowed).toBe(true);
  });

  it('blocks when deposits are not cleared (§49: no mint against pending funds)', () => {
    const d = evaluateMintGuard(okFacts({ fundingDepositsCleared: false }));
    expect(d.reasons).toContain(MintBlockReason.DEPOSIT_NOT_CLEARED);
  });

  it('blocks when maker-checker is incomplete', () => {
    const d = evaluateMintGuard(okFacts({ makerCheckerComplete: false }));
    expect(d.reasons).toContain(MintBlockReason.APPROVAL_INCOMPLETE);
  });

  it('blocks when the mint feature flag is disabled', () => {
    const d = evaluateMintGuard(okFacts({ mintFeatureEnabled: false }));
    expect(d.reasons).toContain(MintBlockReason.MINT_FEATURE_DISABLED);
  });

  it('accumulates multiple independent block reasons', () => {
    const d = evaluateMintGuard(
      okFacts({
        complianceHoldActive: true,
        programSuspended: true,
        hasUnresolvedReconciliation: true,
      }),
    );
    expect(d.reasons).toContain(MintBlockReason.COMPLIANCE_HOLD);
    expect(d.reasons).toContain(MintBlockReason.PROGRAM_SUSPENDED);
    expect(d.reasons).toContain(MintBlockReason.RECONCILIATION_UNRESOLVED);
    expect(d.allowed).toBe(false);
  });
});
