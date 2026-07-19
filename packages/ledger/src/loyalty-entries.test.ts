import { describe, it, expect } from 'vitest';
import { money } from '@trustee/domain';
import { accountEffect, type JournalReferences } from './journal';
import { LedgerAccountCode } from './accounts';
import {
  paykhProgramFundingEntry,
  paykhLoyaltyIssuanceEntry,
  paykhLoyaltyRedemptionEntry,
  paykhMerchantSettlementEntry,
} from './entries';

const refs: JournalReferences = {
  source: 'loyalty:test',
  programId: 'tenant_1',
  assetId: 'mUSD',
  actor: 'svc:test',
};

const A = LedgerAccountCode;

/** Net effect of a list of entries on one account, respecting normal side. */
function net(entries: ReturnType<typeof paykhProgramFundingEntry>[], account: string): bigint {
  return entries.reduce((acc, e) => acc + accountEffect(e, account).minor, 0n);
}

describe('backed loyalty stablecoin entries (§23)', () => {
  it('issuance moves value program-fund -> loyalty, leaving bank cash untouched', () => {
    const e = paykhLoyaltyIssuanceEntry(money(100_00n, 'USD'), refs);
    expect(accountEffect(e, A.LIABILITY_PAYKH_PROGRAM_FUND).minor).toBe(-100_00n);
    expect(accountEffect(e, A.LIABILITY_PAYKH_LOYALTY_STABLECOIN).minor).toBe(100_00n);
    expect(accountEffect(e, A.ASSET_TRUSTEE_BANK_CASH).minor).toBe(0n);
  });

  it('redemption swaps loyalty -> merchant payable', () => {
    const e = paykhLoyaltyRedemptionEntry(money(40_00n, 'USD'), refs);
    expect(accountEffect(e, A.LIABILITY_PAYKH_LOYALTY_STABLECOIN).minor).toBe(-40_00n);
    expect(accountEffect(e, A.LIABILITY_PAYKH_MERCHANT_PAYABLE).minor).toBe(40_00n);
  });

  it('fund -> issue -> redeem -> settle keeps the customer fully backed at every step', () => {
    const X = money(100_00n, 'USD');
    const fund = paykhProgramFundingEntry(X, refs);
    const issue = paykhLoyaltyIssuanceEntry(X, refs);
    const redeem = paykhLoyaltyRedemptionEntry(X, refs);
    const settle = paykhMerchantSettlementEntry(X, refs);

    // Total customer-facing liability = program fund + loyalty + merchant payable.
    const liability = (es: typeof fund[]) =>
      net(es, A.LIABILITY_PAYKH_PROGRAM_FUND) +
      net(es, A.LIABILITY_PAYKH_LOYALTY_STABLECOIN) +
      net(es, A.LIABILITY_PAYKH_MERCHANT_PAYABLE);
    const cash = (es: typeof fund[]) => net(es, A.ASSET_TRUSTEE_BANK_CASH);

    // After each stage, bank cash always covers the outstanding liability.
    const stages = [[fund], [fund, issue], [fund, issue, redeem], [fund, issue, redeem, settle]];
    for (const s of stages) {
      expect(cash(s)).toBeGreaterThanOrEqual(liability(s));
    }

    // End state: the safeguarded backing flowed out to the merchant — program
    // fund down by X and bank cash down by X, all other balances back to zero.
    const all = [fund, issue, redeem, settle];
    expect(net(all, A.LIABILITY_PAYKH_PROGRAM_FUND)).toBe(0n); // +X funded, -X issued
    expect(net(all, A.LIABILITY_PAYKH_LOYALTY_STABLECOIN)).toBe(0n); // +X issued, -X redeemed
    expect(net(all, A.LIABILITY_PAYKH_MERCHANT_PAYABLE)).toBe(0n); // +X redeemed, -X settled
    expect(cash(all)).toBe(0n); // +X funded, -X settled
  });
});
