import { describe, it, expect } from 'vitest';
import { money, zero } from '@trustee/domain';
import {
  eligibleReserve,
  reserveObligation,
  reserveRatioBps,
  mintCapacity,
  requiredSafetyBuffer,
  isFullyReserved,
  reserveSurplus,
} from './reserve-calculation';

const USD = 'USD';
const m = (v: bigint) => money(v, USD);

describe('eligibleReserve', () => {
  it('subtracts all ineligible amounts from cleared balance', () => {
    const r = eligibleReserve({
      currency: USD,
      clearedBankBalance: m(1_000_00n),
      restrictedFunds: m(100_00n),
      unmatchedFunds: m(50_00n),
      pendingOutgoingPayouts: m(25_00n),
      bankChargesDue: m(5_00n),
      regulatoryHolds: m(0n),
      operationalFunds: m(20_00n),
      otherIneligibleAmounts: m(0n),
    });
    // 1000 - (100+50+25+5+0+20+0) = 800
    expect(r.minor).toBe(800_00n);
  });

  it('never returns negative', () => {
    const r = eligibleReserve({
      currency: USD,
      clearedBankBalance: m(100n),
      restrictedFunds: m(1_000n),
      unmatchedFunds: zero(USD),
      pendingOutgoingPayouts: zero(USD),
      bankChargesDue: zero(USD),
      regulatoryHolds: zero(USD),
      operationalFunds: zero(USD),
      otherIneligibleAmounts: zero(USD),
    });
    expect(r.minor).toBe(0n);
  });
});

describe('reserveObligation', () => {
  it('adds liabilities and subtracts approved exclusions', () => {
    const r = reserveObligation({
      currency: USD,
      circulatingSupply: m(900_00n),
      confirmedRedemptionObligations: m(50_00n),
      otherContractualLiabilities: m(10_00n),
      legallyApprovedExclusions: m(60_00n),
    });
    expect(r.minor).toBe(900_00n);
  });
});

describe('reserveRatioBps', () => {
  it('computes 100% as 10000 bps', () => {
    expect(reserveRatioBps(m(1000n), m(1000n))).toBe(10000);
  });
  it('computes 150% as 15000 bps', () => {
    expect(reserveRatioBps(m(1500n), m(1000n))).toBe(15000);
  });
  it('returns null on zero obligation', () => {
    expect(reserveRatioBps(m(1000n), m(0n))).toBeNull();
  });
});

describe('mintCapacity', () => {
  it('deducts obligation, buffer and pending mints', () => {
    const c = mintCapacity({
      currency: USD,
      eligibleReserve: m(1_000_00n),
      existingReserveObligation: m(600_00n),
      requiredSafetyBuffer: m(100_00n),
      pendingMintAuthorizations: m(50_00n),
    });
    // 1000 - 600 - 100 - 50 = 250
    expect(c.minor).toBe(250_00n);
  });

  it('is clamped at zero when over-obligated', () => {
    const c = mintCapacity({
      currency: USD,
      eligibleReserve: m(100n),
      existingReserveObligation: m(500n),
      requiredSafetyBuffer: zero(USD),
      pendingMintAuthorizations: zero(USD),
    });
    expect(c.minor).toBe(0n);
  });
});

describe('requiredSafetyBuffer / isFullyReserved / surplus', () => {
  it('computes a percentage buffer', () => {
    expect(requiredSafetyBuffer(m(1000n), 1000).minor).toBe(100n); // 10%
  });
  it('checks 100% coverage requirement', () => {
    expect(isFullyReserved(m(1000n), m(1000n), 10000)).toBe(true);
    expect(isFullyReserved(m(999n), m(1000n), 10000)).toBe(false);
    expect(isFullyReserved(m(0n), m(0n), 10000)).toBe(true);
  });
  it('reports surplus and shortfall as signed', () => {
    expect(reserveSurplus(m(1100n), m(1000n)).minor).toBe(100n);
    expect(reserveSurplus(m(900n), m(1000n)).minor).toBe(-100n);
  });
});
