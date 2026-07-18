import { describe, it, expect } from 'vitest';
import {
  backingPolicyFor,
  requiresFiatBacking,
  FundClassification,
} from './index';

describe('fund classification engine', () => {
  it('does not require reserve for non-monetary promotional points', () => {
    expect(requiresFiatBacking(FundClassification.NON_MONETARY_PROMOTIONAL_POINT)).toBe(false);
  });

  it('requires 100% backing for cashback and gift-card liabilities', () => {
    expect(backingPolicyFor(FundClassification.CASHBACK_LIABILITY).requiredBackingBps).toBe(10000);
    expect(backingPolicyFor(FundClassification.GIFT_CARD_LIABILITY).fiatBackingRequired).toBe(true);
  });

  it('requires backing and authorization for fiat-backed stablecoin liability', () => {
    const p = backingPolicyFor(FundClassification.FIAT_BACKED_STABLECOIN_LIABILITY);
    expect(p.fiatBackingRequired).toBe(true);
    expect(p.authorizationRequired).toBe(true);
    expect(p.redeemable).toBe(true);
  });

  it('treats closed-loop loyalty value as redeemable but not fiat-backed', () => {
    const p = backingPolicyFor(FundClassification.CLOSED_LOOP_LOYALTY_VALUE);
    expect(p.fiatBackingRequired).toBe(false);
    expect(p.redeemable).toBe(true);
  });
});
