/**
 * Canonical enums shared across the platform. Mirror the specification
 * (trusteebankprompt) so the domain vocabulary is single-sourced.
 */
/** §3 Regulatory / account classification models. */
export declare const AccountClassification: {
    readonly SAFEGUARDED_CUSTOMER_FUNDS: "SAFEGUARDED_CUSTOMER_FUNDS";
    readonly TRUST_ACCOUNT: "TRUST_ACCOUNT";
    readonly ESCROW_ACCOUNT: "ESCROW_ACCOUNT";
    readonly CLIENT_MONEY_ACCOUNT: "CLIENT_MONEY_ACCOUNT";
    readonly RESERVE_ACCOUNT: "RESERVE_ACCOUNT";
    readonly SETTLEMENT_ACCOUNT: "SETTLEMENT_ACCOUNT";
    readonly REDEMPTION_ACCOUNT: "REDEMPTION_ACCOUNT";
    readonly OPERATIONAL_ACCOUNT: "OPERATIONAL_ACCOUNT";
    readonly FEE_ACCOUNT: "FEE_ACCOUNT";
    readonly COLLATERAL_ACCOUNT: "COLLATERAL_ACCOUNT";
    readonly TOKENIZED_DEPOSIT_ACCOUNT: "TOKENIZED_DEPOSIT_ACCOUNT";
};
export type AccountClassification = (typeof AccountClassification)[keyof typeof AccountClassification];
/** §12 Deposit lifecycle statuses. */
export declare const DepositStatus: {
    readonly EXPECTED: "EXPECTED";
    readonly DETECTED: "DETECTED";
    readonly UNMATCHED: "UNMATCHED";
    readonly MATCHED: "MATCHED";
    readonly PENDING_CLEARANCE: "PENDING_CLEARANCE";
    readonly CLEARED: "CLEARED";
    readonly HELD: "HELD";
    readonly REJECTED: "REJECTED";
    readonly RETURNED: "RETURNED";
    readonly ALLOCATED_TO_RESERVE: "ALLOCATED_TO_RESERVE";
    readonly AVAILABLE_FOR_MINT: "AVAILABLE_FOR_MINT";
    readonly CONSUMED_BY_MINT: "CONSUMED_BY_MINT";
    readonly REFUNDED: "REFUNDED";
    readonly MANUAL_REVIEW: "MANUAL_REVIEW";
};
export type DepositStatus = (typeof DepositStatus)[keyof typeof DepositStatus];
/** A deposit is only eligible to back minting in these terminal-cleared states. */
export declare const MINT_ELIGIBLE_DEPOSIT_STATUSES: readonly DepositStatus[];
/** §18 Mint authorization statuses. */
export declare const MintAuthorizationStatus: {
    readonly DRAFT: "DRAFT";
    readonly PENDING_MAKER: "PENDING_MAKER";
    readonly PENDING_CHECKER: "PENDING_CHECKER";
    readonly APPROVED: "APPROVED";
    readonly ISSUED: "ISSUED";
    readonly CONSUMED: "CONSUMED";
    readonly EXPIRED: "EXPIRED";
    readonly REVOKED: "REVOKED";
    readonly REJECTED: "REJECTED";
};
export type MintAuthorizationStatus = (typeof MintAuthorizationStatus)[keyof typeof MintAuthorizationStatus];
/** §20 Redemption statuses. */
export declare const RedemptionStatus: {
    readonly REQUESTED: "REQUESTED";
    readonly VALIDATING: "VALIDATING";
    readonly COMPLIANCE_REVIEW: "COMPLIANCE_REVIEW";
    readonly AWAITING_APPROVAL: "AWAITING_APPROVAL";
    readonly APPROVED: "APPROVED";
    readonly ASSET_LOCK_PENDING: "ASSET_LOCK_PENDING";
    readonly ASSET_LOCKED: "ASSET_LOCKED";
    readonly BURN_PENDING: "BURN_PENDING";
    readonly BURN_CONFIRMED: "BURN_CONFIRMED";
    readonly PAYOUT_PENDING: "PAYOUT_PENDING";
    readonly PAYOUT_SUBMITTED: "PAYOUT_SUBMITTED";
    readonly PAYOUT_CONFIRMED: "PAYOUT_CONFIRMED";
    readonly COMPLETED: "COMPLETED";
    readonly REJECTED: "REJECTED";
    readonly FAILED: "FAILED";
    readonly RETURNED: "RETURNED";
    readonly MANUAL_REVIEW: "MANUAL_REVIEW";
};
export type RedemptionStatus = (typeof RedemptionStatus)[keyof typeof RedemptionStatus];
/** §26 Compliance / monitoring risk levels. */
export declare const RiskLevel: {
    readonly LOW: "LOW";
    readonly MEDIUM: "MEDIUM";
    readonly HIGH: "HIGH";
    readonly CRITICAL: "CRITICAL";
};
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];
/** §33 Data classification. */
export declare const DataClassification: {
    readonly PUBLIC: "PUBLIC";
    readonly INTERNAL: "INTERNAL";
    readonly CONFIDENTIAL: "CONFIDENTIAL";
    readonly RESTRICTED: "RESTRICTED";
    readonly REGULATORY_RESTRICTED: "REGULATORY_RESTRICTED";
};
export type DataClassification = (typeof DataClassification)[keyof typeof DataClassification];
/**
 * Fund classification engine (update §16). Determines whether a PayChain asset
 * or PayKH reward carries a real fiat backing obligation. Non-monetary
 * promotional points require no reserve; value-bearing liabilities do.
 */
export declare const FundClassification: {
    readonly NON_MONETARY_PROMOTIONAL_POINT: "NON_MONETARY_PROMOTIONAL_POINT";
    readonly CLOSED_LOOP_LOYALTY_VALUE: "CLOSED_LOOP_LOYALTY_VALUE";
    readonly MERCHANT_FUNDED_REWARD: "MERCHANT_FUNDED_REWARD";
    readonly PLATFORM_FUNDED_REWARD: "PLATFORM_FUNDED_REWARD";
    readonly CASHBACK_LIABILITY: "CASHBACK_LIABILITY";
    readonly GIFT_CARD_LIABILITY: "GIFT_CARD_LIABILITY";
    readonly CUSTOMER_SAFEGUARDED_FUNDS: "CUSTOMER_SAFEGUARDED_FUNDS";
    readonly MERCHANT_SETTLEMENT_PAYABLE: "MERCHANT_SETTLEMENT_PAYABLE";
    readonly STABLE_VALUE_LIABILITY: "STABLE_VALUE_LIABILITY";
    readonly FIAT_BACKED_STABLECOIN_LIABILITY: "FIAT_BACKED_STABLECOIN_LIABILITY";
    readonly TOKENIZED_DEPOSIT_LIABILITY: "TOKENIZED_DEPOSIT_LIABILITY";
};
export type FundClassification = (typeof FundClassification)[keyof typeof FundClassification];
/** The two controlled client platforms served by the trustee platform (update §3). */
export declare const ClientPlatform: {
    readonly PAYCHAIN: "PAYCHAIN";
    readonly PAYKH: "PAYKH";
    readonly TRUSTEE_BANK_PORTAL: "TRUSTEE_BANK_PORTAL";
    readonly AUDITOR_PORTAL: "AUDITOR_PORTAL";
    readonly REGULATOR_PORTAL: "REGULATOR_PORTAL";
};
export type ClientPlatform = (typeof ClientPlatform)[keyof typeof ClientPlatform];
/** §16 Reserve policy models. */
export declare const ReservePolicy: {
    readonly FULL_100: "FULL_100";
    readonly OVERCOLLATERALIZED: "OVERCOLLATERALIZED";
    readonly ASSET_BUFFER: "ASSET_BUFFER";
    readonly INTRADAY_BUFFER: "INTRADAY_BUFFER";
    readonly REDEMPTION_LIQUIDITY_BUFFER: "REDEMPTION_LIQUIDITY_BUFFER";
    readonly REGULATORY_BUFFER: "REGULATORY_BUFFER";
};
export type ReservePolicy = (typeof ReservePolicy)[keyof typeof ReservePolicy];
//# sourceMappingURL=enums.d.ts.map