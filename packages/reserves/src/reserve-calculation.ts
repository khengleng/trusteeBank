/**
 * Reserve calculation (§16) and mint capacity (§17).
 *
 * These are pure functions over `Money` values. They never read the clock,
 * database or network; staleness/connectivity guards live in
 * {@link mint-guard.ts} and operate on caller-supplied facts. This keeps the
 * financial arithmetic fully deterministic and unit-testable.
 */

import {
  add,
  subtract,
  sum,
  zero,
  gte,
  isNegative,
  max,
  type CurrencyCode,
  type Money,
} from '@trustee/domain';

/** Inputs to eligible-reserve calculation (§16). All in one reference currency. */
export interface EligibleReserveInput {
  readonly currency: CurrencyCode;
  readonly clearedBankBalance: Money;
  readonly restrictedFunds: Money;
  readonly unmatchedFunds: Money;
  readonly pendingOutgoingPayouts: Money;
  readonly bankChargesDue: Money;
  readonly regulatoryHolds: Money;
  readonly operationalFunds: Money;
  readonly otherIneligibleAmounts: Money;
}

/**
 * Eligible Reserve = Cleared Bank Balance
 *   - Restricted - Unmatched - Pending Payouts - Bank Charges
 *   - Regulatory Holds - Operational Funds - Other Ineligible
 *
 * Clamped at zero: eligible reserve is never negative.
 */
export function eligibleReserve(input: EligibleReserveInput): Money {
  const deductions = sum([
    input.restrictedFunds,
    input.unmatchedFunds,
    input.pendingOutgoingPayouts,
    input.bankChargesDue,
    input.regulatoryHolds,
    input.operationalFunds,
    input.otherIneligibleAmounts,
  ]);
  const result = subtract(input.clearedBankBalance, deductions);
  return isNegative(result) ? zero(input.currency) : result;
}

export interface ReserveObligationInput {
  readonly currency: CurrencyCode;
  readonly circulatingSupply: Money;
  readonly confirmedRedemptionObligations: Money;
  readonly otherContractualLiabilities: Money;
  readonly legallyApprovedExclusions: Money;
}

/**
 * Reserve Obligation = Circulating Supply + Confirmed Redemption Obligations
 *   + Other Contractual Liabilities - Legally Approved Exclusions
 */
export function reserveObligation(input: ReserveObligationInput): Money {
  const gross = sum([
    input.circulatingSupply,
    input.confirmedRedemptionObligations,
    input.otherContractualLiabilities,
  ]);
  const result = subtract(gross, input.legallyApprovedExclusions);
  return isNegative(result) ? zero(input.currency) : result;
}

/**
 * Reserve Ratio = Eligible Reserve / Reserve Obligation, expressed in basis
 * points (1_00_00 = 100%). Returns null when the obligation is zero
 * (ratio undefined / infinite — treated as fully covered by callers).
 */
export function reserveRatioBps(eligible: Money, obligation: Money): number | null {
  if (obligation.currency !== eligible.currency) {
    throw new Error('Reserve ratio requires a single reference currency');
  }
  if (obligation.minor === 0n) return null;
  // Multiply before divide to preserve precision; result in basis points.
  const bps = (eligible.minor * 10000n) / obligation.minor;
  return Number(bps);
}

export interface MintCapacityInput {
  readonly currency: CurrencyCode;
  readonly eligibleReserve: Money;
  readonly existingReserveObligation: Money;
  readonly requiredSafetyBuffer: Money;
  readonly pendingMintAuthorizations: Money;
}

/**
 * Mint Capacity = Eligible Reserve - Existing Reserve Obligation
 *   - Required Safety Buffer - Pending Mint Authorizations
 *
 * Clamped at zero: capacity is never negative.
 */
export function mintCapacity(input: MintCapacityInput): Money {
  const consumed = sum([
    input.existingReserveObligation,
    input.requiredSafetyBuffer,
    input.pendingMintAuthorizations,
  ]);
  const result = subtract(input.eligibleReserve, consumed);
  return max(result, zero(input.currency));
}

/**
 * Required safety buffer for a policy expressed in basis points over the base
 * obligation (e.g. 10_00 bps buffer => 10% of obligation held back).
 */
export function requiredSafetyBuffer(
  obligation: Money,
  bufferBps: number,
): Money {
  if (bufferBps < 0) throw new Error('Buffer basis points cannot be negative');
  const bufferMinor = (obligation.minor * BigInt(Math.trunc(bufferBps))) / 10000n;
  return { minor: bufferMinor, currency: obligation.currency };
}

/** True when eligible reserve covers the obligation at the required ratio. */
export function isFullyReserved(
  eligible: Money,
  obligation: Money,
  requiredRatioBps: number,
): boolean {
  if (obligation.minor === 0n) return true;
  const required = (obligation.minor * BigInt(Math.trunc(requiredRatioBps))) / 10000n;
  return gte(eligible, { minor: required, currency: obligation.currency });
}

/** Surplus (positive) or shortfall (negative) of eligible reserve vs obligation. */
export function reserveSurplus(eligible: Money, obligation: Money): Money {
  return subtract(eligible, obligation);
}

export { add, zero };
