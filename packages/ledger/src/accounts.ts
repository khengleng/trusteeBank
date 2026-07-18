/**
 * Chart of accounts for the trustee reserve subledger (§14).
 *
 * Normal balance sides follow standard double-entry conventions:
 *   ASSET, EXPENSE      -> DEBIT normal
 *   LIABILITY, INCOME   -> CREDIT normal
 *   SUSPENSE            -> tracked, no assumed normal side
 */

export const LedgerAccountType = {
  ASSET: 'ASSET',
  LIABILITY: 'LIABILITY',
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE',
  SUSPENSE: 'SUSPENSE',
} as const;
export type LedgerAccountType =
  (typeof LedgerAccountType)[keyof typeof LedgerAccountType];

/** Canonical ledger account codes from §14 and update §21. */
export const LedgerAccountCode = {
  // Trustee bank cash & receivables (§14)
  ASSET_TRUSTEE_BANK_CASH: 'ASSET:TRUSTEE_BANK_CASH',
  ASSET_PAYCHAIN_RESERVE_CASH: 'ASSET:PAYCHAIN_RESERVE_CASH',
  ASSET_SETTLEMENT_RECEIVABLE: 'ASSET:SETTLEMENT_RECEIVABLE',
  ASSET_REDEMPTION_RECEIVABLE: 'ASSET:REDEMPTION_RECEIVABLE',
  // PayChain reserve liabilities (§14)
  LIABILITY_PAYCHAIN_RESERVE_OBLIGATION: 'LIABILITY:PAYCHAIN_RESERVE_OBLIGATION',
  LIABILITY_PENDING_MINT: 'LIABILITY:PENDING_MINT',
  LIABILITY_PENDING_REDEMPTION: 'LIABILITY:PENDING_REDEMPTION',
  LIABILITY_UNMATCHED_DEPOSIT: 'LIABILITY:UNMATCHED_DEPOSIT',
  // PayKH liabilities (update §21)
  LIABILITY_PAYKH_MERCHANT_PAYABLE: 'LIABILITY:PAYKH_MERCHANT_PAYABLE',
  LIABILITY_PAYKH_CASHBACK_PROGRAM: 'LIABILITY:PAYKH_CASHBACK_PROGRAM',
  LIABILITY_PAYKH_GIFT_CARD_FLOAT: 'LIABILITY:PAYKH_GIFT_CARD_FLOAT',
  LIABILITY_PAYKH_CUSTOMER_SAFEGUARDING: 'LIABILITY:PAYKH_CUSTOMER_SAFEGUARDING',
  LIABILITY_PAYKH_PROGRAM_FUND: 'LIABILITY:PAYKH_PROGRAM_FUND',
  // Trustee income/expense/suspense (§14)
  INCOME_TRUSTEE_FEE: 'INCOME:TRUSTEE_FEE',
  EXPENSE_BANK_CHARGE: 'EXPENSE:BANK_CHARGE',
  SUSPENSE_UNRECONCILED_ITEM: 'SUSPENSE:UNRECONCILED_ITEM',
} as const;
export type LedgerAccountCode =
  (typeof LedgerAccountCode)[keyof typeof LedgerAccountCode];

export function ledgerAccountTypeOf(code: string): LedgerAccountType {
  const prefix = code.split(':')[0];
  switch (prefix) {
    case 'ASSET':
      return LedgerAccountType.ASSET;
    case 'LIABILITY':
      return LedgerAccountType.LIABILITY;
    case 'INCOME':
      return LedgerAccountType.INCOME;
    case 'EXPENSE':
      return LedgerAccountType.EXPENSE;
    case 'SUSPENSE':
      return LedgerAccountType.SUSPENSE;
    default:
      throw new Error(`Unknown ledger account prefix in code "${code}"`);
  }
}
