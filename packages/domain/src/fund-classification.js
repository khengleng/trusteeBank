"use strict";
/**
 * Fund classification policy (update §16). Each classification declares whether
 * fiat backing is required and the minimum backing ratio in basis points.
 *
 * Two rules from the spec are encoded here:
 *  - Do NOT automatically require reserve for all loyalty points.
 *  - Do NOT automatically treat value-bearing rewards as unregulated points.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.backingPolicyFor = backingPolicyFor;
exports.requiresFiatBacking = requiresFiatBacking;
const POLICIES = {
    NON_MONETARY_PROMOTIONAL_POINT: policy('NON_MONETARY_PROMOTIONAL_POINT', false, 0, false, false, false),
    CLOSED_LOOP_LOYALTY_VALUE: policy('CLOSED_LOOP_LOYALTY_VALUE', false, 0, true, false, false),
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
function policy(classification, fiatBackingRequired, requiredBackingBps, redeemable, transferable, authorizationRequired) {
    return {
        classification,
        fiatBackingRequired,
        requiredBackingBps,
        redeemable,
        transferable,
        authorizationRequired,
    };
}
function backingPolicyFor(classification) {
    return POLICIES[classification];
}
/** Whether issuing this classification requires verified fiat backing first. */
function requiresFiatBacking(classification) {
    return POLICIES[classification].fiatBackingRequired;
}
//# sourceMappingURL=fund-classification.js.map