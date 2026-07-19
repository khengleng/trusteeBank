/**
 * Canonical enums shared across the platform. Mirror the specification
 * (trusteebankprompt) so the domain vocabulary is single-sourced.
 */

/** §3 Regulatory / account classification models. */
export const AccountClassification = {
  SAFEGUARDED_CUSTOMER_FUNDS: 'SAFEGUARDED_CUSTOMER_FUNDS',
  TRUST_ACCOUNT: 'TRUST_ACCOUNT',
  ESCROW_ACCOUNT: 'ESCROW_ACCOUNT',
  CLIENT_MONEY_ACCOUNT: 'CLIENT_MONEY_ACCOUNT',
  RESERVE_ACCOUNT: 'RESERVE_ACCOUNT',
  SETTLEMENT_ACCOUNT: 'SETTLEMENT_ACCOUNT',
  REDEMPTION_ACCOUNT: 'REDEMPTION_ACCOUNT',
  OPERATIONAL_ACCOUNT: 'OPERATIONAL_ACCOUNT',
  FEE_ACCOUNT: 'FEE_ACCOUNT',
  COLLATERAL_ACCOUNT: 'COLLATERAL_ACCOUNT',
  TOKENIZED_DEPOSIT_ACCOUNT: 'TOKENIZED_DEPOSIT_ACCOUNT',
} as const;
export type AccountClassification =
  (typeof AccountClassification)[keyof typeof AccountClassification];

/** §12 Deposit lifecycle statuses. */
export const DepositStatus = {
  EXPECTED: 'EXPECTED',
  DETECTED: 'DETECTED',
  UNMATCHED: 'UNMATCHED',
  MATCHED: 'MATCHED',
  PENDING_CLEARANCE: 'PENDING_CLEARANCE',
  CLEARED: 'CLEARED',
  HELD: 'HELD',
  REJECTED: 'REJECTED',
  RETURNED: 'RETURNED',
  ALLOCATED_TO_RESERVE: 'ALLOCATED_TO_RESERVE',
  AVAILABLE_FOR_MINT: 'AVAILABLE_FOR_MINT',
  CONSUMED_BY_MINT: 'CONSUMED_BY_MINT',
  REFUNDED: 'REFUNDED',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
} as const;
export type DepositStatus = (typeof DepositStatus)[keyof typeof DepositStatus];

/** A deposit is only eligible to back minting in these terminal-cleared states. */
export const MINT_ELIGIBLE_DEPOSIT_STATUSES: readonly DepositStatus[] = [
  DepositStatus.CLEARED,
  DepositStatus.ALLOCATED_TO_RESERVE,
  DepositStatus.AVAILABLE_FOR_MINT,
];

/** §18 Mint authorization statuses. */
export const MintAuthorizationStatus = {
  DRAFT: 'DRAFT',
  PENDING_MAKER: 'PENDING_MAKER',
  PENDING_CHECKER: 'PENDING_CHECKER',
  APPROVED: 'APPROVED',
  ISSUED: 'ISSUED',
  CONSUMED: 'CONSUMED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
  REJECTED: 'REJECTED',
} as const;
export type MintAuthorizationStatus =
  (typeof MintAuthorizationStatus)[keyof typeof MintAuthorizationStatus];

/** §20 Redemption statuses. */
export const RedemptionStatus = {
  REQUESTED: 'REQUESTED',
  VALIDATING: 'VALIDATING',
  COMPLIANCE_REVIEW: 'COMPLIANCE_REVIEW',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  APPROVED: 'APPROVED',
  ASSET_LOCK_PENDING: 'ASSET_LOCK_PENDING',
  ASSET_LOCKED: 'ASSET_LOCKED',
  BURN_PENDING: 'BURN_PENDING',
  BURN_CONFIRMED: 'BURN_CONFIRMED',
  PAYOUT_PENDING: 'PAYOUT_PENDING',
  PAYOUT_SUBMITTED: 'PAYOUT_SUBMITTED',
  PAYOUT_CONFIRMED: 'PAYOUT_CONFIRMED',
  COMPLETED: 'COMPLETED',
  REJECTED: 'REJECTED',
  FAILED: 'FAILED',
  RETURNED: 'RETURNED',
  MANUAL_REVIEW: 'MANUAL_REVIEW',
} as const;
export type RedemptionStatus =
  (typeof RedemptionStatus)[keyof typeof RedemptionStatus];

/** §26 Compliance / monitoring risk levels. */
export const RiskLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

/** §33 Data classification. */
export const DataClassification = {
  PUBLIC: 'PUBLIC',
  INTERNAL: 'INTERNAL',
  CONFIDENTIAL: 'CONFIDENTIAL',
  RESTRICTED: 'RESTRICTED',
  REGULATORY_RESTRICTED: 'REGULATORY_RESTRICTED',
} as const;
export type DataClassification =
  (typeof DataClassification)[keyof typeof DataClassification];

/**
 * Fund classification engine (update §16). Determines whether a PayChain asset
 * or PayKH reward carries a real fiat backing obligation. Non-monetary
 * promotional points require no reserve; value-bearing liabilities do.
 */
export const FundClassification = {
  NON_MONETARY_PROMOTIONAL_POINT: 'NON_MONETARY_PROMOTIONAL_POINT',
  CLOSED_LOOP_LOYALTY_VALUE: 'CLOSED_LOOP_LOYALTY_VALUE',
  // A loyalty point that is actually a fiat-backed stablecoin (pegged to USD/KHR),
  // issued on-chain (Stellar) and redeemable/transferable — fully reserved 1:1.
  // Distinct from CLOSED_LOOP_LOYALTY_VALUE, which is unbacked closed-loop value.
  BACKED_LOYALTY_STABLECOIN: 'BACKED_LOYALTY_STABLECOIN',
  MERCHANT_FUNDED_REWARD: 'MERCHANT_FUNDED_REWARD',
  PLATFORM_FUNDED_REWARD: 'PLATFORM_FUNDED_REWARD',
  CASHBACK_LIABILITY: 'CASHBACK_LIABILITY',
  GIFT_CARD_LIABILITY: 'GIFT_CARD_LIABILITY',
  CUSTOMER_SAFEGUARDED_FUNDS: 'CUSTOMER_SAFEGUARDED_FUNDS',
  MERCHANT_SETTLEMENT_PAYABLE: 'MERCHANT_SETTLEMENT_PAYABLE',
  STABLE_VALUE_LIABILITY: 'STABLE_VALUE_LIABILITY',
  FIAT_BACKED_STABLECOIN_LIABILITY: 'FIAT_BACKED_STABLECOIN_LIABILITY',
  TOKENIZED_DEPOSIT_LIABILITY: 'TOKENIZED_DEPOSIT_LIABILITY',
} as const;
export type FundClassification =
  (typeof FundClassification)[keyof typeof FundClassification];

/** The two controlled client platforms served by the trustee platform (update §3). */
export const ClientPlatform = {
  PAYCHAIN: 'PAYCHAIN',
  PAYKH: 'PAYKH',
  TRUSTEE_BANK_PORTAL: 'TRUSTEE_BANK_PORTAL',
  AUDITOR_PORTAL: 'AUDITOR_PORTAL',
  REGULATOR_PORTAL: 'REGULATOR_PORTAL',
} as const;
export type ClientPlatform = (typeof ClientPlatform)[keyof typeof ClientPlatform];

/** §16 Reserve policy models. */
export const ReservePolicy = {
  FULL_100: 'FULL_100',
  OVERCOLLATERALIZED: 'OVERCOLLATERALIZED',
  ASSET_BUFFER: 'ASSET_BUFFER',
  INTRADAY_BUFFER: 'INTRADAY_BUFFER',
  REDEMPTION_LIQUIDITY_BUFFER: 'REDEMPTION_LIQUIDITY_BUFFER',
  REGULATORY_BUFFER: 'REGULATORY_BUFFER',
} as const;
export type ReservePolicy = (typeof ReservePolicy)[keyof typeof ReservePolicy];
