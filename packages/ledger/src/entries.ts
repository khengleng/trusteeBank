/**
 * Standard journal templates for the reserve subledger lifecycle. Each returns
 * a balanced {@link JournalEntry}. Business services call these rather than
 * hand-assembling postings, so the accounting stays consistent.
 */

import { zero, type Money } from '@trustee/domain';
import { LedgerAccountCode } from './accounts';
import {
  buildJournalEntry,
  type JournalEntry,
  type JournalReferences,
} from './journal';

function debit(account: string, amount: Money) {
  return { account, debit: amount, credit: zero(amount.currency) };
}
function credit(account: string, amount: Money) {
  return { account, debit: zero(amount.currency), credit: amount };
}

/**
 * A cleared reserve deposit: bank cash increases, and the reserve obligation
 * owed to PayChain (the safeguarded liability) increases by the same amount.
 */
export function clearedDepositEntry(
  amount: Money,
  references: JournalReferences,
): JournalEntry {
  return buildJournalEntry({
    currency: amount.currency,
    description: 'Cleared reserve deposit allocated to PayChain obligation',
    postings: [
      debit(LedgerAccountCode.ASSET_TRUSTEE_BANK_CASH, amount),
      credit(LedgerAccountCode.LIABILITY_PAYCHAIN_RESERVE_OBLIGATION, amount),
    ],
    references,
  });
}

/**
 * Mint authorization consumes cleared reserve capacity: move the amount from
 * the general reserve obligation into an earmarked pending-mint liability.
 */
export function mintReservationEntry(
  amount: Money,
  references: JournalReferences,
): JournalEntry {
  return buildJournalEntry({
    currency: amount.currency,
    description: 'Reserve earmarked for pending mint authorization',
    postings: [
      debit(LedgerAccountCode.LIABILITY_PAYCHAIN_RESERVE_OBLIGATION, amount),
      credit(LedgerAccountCode.LIABILITY_PENDING_MINT, amount),
    ],
    references,
  });
}

/**
 * Release an earmarked mint reservation back to the general reserve obligation.
 * Used on mint confirmation (the pending mint is realized against circulating
 * supply) and on revoke/expire (capacity returned). Inverse of
 * {@link mintReservationEntry}, with positive amounts (never negate postings).
 */
export function mintReleaseEntry(
  amount: Money,
  references: JournalReferences,
): JournalEntry {
  return buildJournalEntry({
    currency: amount.currency,
    description: 'Pending mint reservation released to reserve obligation',
    postings: [
      debit(LedgerAccountCode.LIABILITY_PENDING_MINT, amount),
      credit(LedgerAccountCode.LIABILITY_PAYCHAIN_RESERVE_OBLIGATION, amount),
    ],
    references,
  });
}

/**
 * Redemption obligation recognised: reserve obligation is reduced and moved to
 * a pending-redemption liability awaiting fiat payout.
 */
export function redemptionObligationEntry(
  amount: Money,
  references: JournalReferences,
): JournalEntry {
  return buildJournalEntry({
    currency: amount.currency,
    description: 'Reserve obligation moved to pending redemption',
    postings: [
      debit(LedgerAccountCode.LIABILITY_PAYCHAIN_RESERVE_OBLIGATION, amount),
      credit(LedgerAccountCode.LIABILITY_PENDING_REDEMPTION, amount),
    ],
    references,
  });
}

/**
 * Fiat payout confirmed for a redemption: bank cash decreases and the pending
 * redemption liability is discharged.
 */
export function payoutConfirmedEntry(
  amount: Money,
  references: JournalReferences,
): JournalEntry {
  return buildJournalEntry({
    currency: amount.currency,
    description: 'Fiat payout confirmed; pending redemption discharged',
    postings: [
      debit(LedgerAccountCode.LIABILITY_PENDING_REDEMPTION, amount),
      credit(LedgerAccountCode.ASSET_TRUSTEE_BANK_CASH, amount),
    ],
    references,
  });
}

// --- PayKH entries (update §21) -------------------------------------------

/**
 * PayKH customer payment collected: bank cash increases; a merchant payable
 * liability is recognised until settlement.
 */
export function paykhPaymentCollectionEntry(
  amount: Money,
  references: JournalReferences,
): JournalEntry {
  return buildJournalEntry({
    currency: amount.currency,
    description: 'PayKH customer payment collected',
    postings: [
      debit(LedgerAccountCode.ASSET_TRUSTEE_BANK_CASH, amount),
      credit(LedgerAccountCode.LIABILITY_PAYKH_MERCHANT_PAYABLE, amount),
    ],
    references,
  });
}

/**
 * Merchant settlement executed: the merchant payable is discharged and bank
 * cash decreases.
 */
export function paykhMerchantSettlementEntry(
  amount: Money,
  references: JournalReferences,
): JournalEntry {
  return buildJournalEntry({
    currency: amount.currency,
    description: 'PayKH merchant settlement executed',
    postings: [
      debit(LedgerAccountCode.LIABILITY_PAYKH_MERCHANT_PAYABLE, amount),
      credit(LedgerAccountCode.ASSET_TRUSTEE_BANK_CASH, amount),
    ],
    references,
  });
}

/**
 * PayKH program (e.g. cashback) funded: bank cash increases; a program-fund
 * liability is recognised as safeguarded.
 */
export function paykhProgramFundingEntry(
  amount: Money,
  references: JournalReferences,
): JournalEntry {
  return buildJournalEntry({
    currency: amount.currency,
    description: 'PayKH program fund safeguarded',
    postings: [
      debit(LedgerAccountCode.ASSET_TRUSTEE_BANK_CASH, amount),
      credit(LedgerAccountCode.LIABILITY_PAYKH_PROGRAM_FUND, amount),
    ],
    references,
  });
}
