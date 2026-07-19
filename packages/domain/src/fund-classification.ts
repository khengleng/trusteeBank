/**
 * Fund classification policy (update §16). Each classification declares whether
 * fiat backing is required and the minimum backing ratio in basis points.
 *
 * Two rules from the spec are encoded here:
 *  - Do NOT automatically require reserve for all loyalty points.
 *  - Do NOT automatically treat value-bearing rewards as unregulated points.
 */

import { FundClassification } from './enums';

export interface FundBackingPolicy {
  readonly classification: FundClassification;
  readonly fiatBackingRequired: boolean;
  /** Minimum backing ratio in basis points (10000 = 100%). 0 if not required. */
  readonly requiredBackingBps: number;
  readonly redeemable: boolean;
  readonly transferable: boolean;
  /** Whether mint/issuance requires trustee authorization. */
  readonly authorizationRequired: boolean;
}

const POLICIES: Record<FundClassification, FundBackingPolicy> = {
  NON_MONETARY_PROMOTIONAL_POINT: policy('NON_MONETARY_PROMOTIONAL_POINT', false, 0, false, false, false),
  CLOSED_LOOP_LOYALTY_VALUE: policy('CLOSED_LOOP_LOYALTY_VALUE', false, 0, true, false, false),
  // Fiat-backed loyalty stablecoin: 100% reserved, redeemable and transferable,
  // and trustee-authorized at issuance (it moves real safeguarded funds).
  BACKED_LOYALTY_STABLECOIN: policy('BACKED_LOYALTY_STABLECOIN', true, 10000, true, true, true),
  MERCHANT_FUNDED_REWARD: policy('MERCHANT_FUNDED_REWARD', true, 10000, true, false, true),
  PLATFORM_FUNDED_REWARD: policy('PLATFORM_FUNDED_REWARD', true, 10000, true, false, true),
  CASHBACK_LIABILITY: policy('CASHBACK_LIABILITY', true, 10000, true, false, true),
  GIFT_CARD_LIABILITY: policy('GIFT_CARD_LIABILITY', true, 10000, true, true, true),
  CUSTOMER_SAFEGUARDED_FUNDS: policy('CUSTOMER_SAFEGUARDED_FUNDS', true, 10000, true, true, true),
  MERCHANT_SETTLEMENT_PAYABLE: policy('MERCHANT_SETTLEMENT_PAYABLE', true, 10000, false, false, true),
  STABLE_VALUE_LIABILITY: policy('STABLE_VALUE_LIABILITY', true, 10000, true, true, true),
  FIAT_BACKED_STABLECOIN_LIABILITY: policy('FIAT_BACKED_STABLECOIN_LIABILITY', true, 10000, true, true, true),
  TOKENIZED_DEPOSIT_LIABILITY: policy('TOKENIZED_DEPOSIT_LIABILITY', true, 10000, true, true, true),
};

function policy(
  classification: FundClassification,
  fiatBackingRequired: boolean,
  requiredBackingBps: number,
  redeemable: boolean,
  transferable: boolean,
  authorizationRequired: boolean,
): FundBackingPolicy {
  return {
    classification,
    fiatBackingRequired,
    requiredBackingBps,
    redeemable,
    transferable,
    authorizationRequired,
  };
}

export function backingPolicyFor(classification: FundClassification): FundBackingPolicy {
  return POLICIES[classification];
}

/** Whether issuing this classification requires verified fiat backing first. */
export function requiresFiatBacking(classification: FundClassification): boolean {
  return POLICIES[classification].fiatBackingRequired;
}
