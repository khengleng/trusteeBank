/**
 * Double-entry journal engine (§14).
 *
 * Rules enforced here (from §14 and §49):
 *  - Every journal entry must balance to zero (sum of debits == sum of credits).
 *  - All postings within a journal share one currency.
 *  - Entries are immutable once built; corrections are made via compensating
 *    (reversal) entries, never by editing a posted entry.
 *  - Each journal carries source, program, asset, actor and approval references.
 */

import {
  add,
  zero,
  isZero,
  subtract,
  type CurrencyCode,
  type Money,
} from '@trustee/domain';
import { ledgerAccountTypeOf, LedgerAccountType } from './accounts';

export interface Posting {
  readonly account: string;
  /** Exactly one of debit/credit is a positive amount; the other is zero. */
  readonly debit: Money;
  readonly credit: Money;
  readonly memo?: string;
}

export interface JournalReferences {
  readonly source: string; // e.g. "deposit:dep_123", "mint-auth:ma_9"
  readonly programId: string;
  readonly assetId: string;
  readonly actor: string; // user or service identity
  readonly approvalRef?: string;
  readonly correlationId?: string;
}

export interface JournalEntryInput {
  readonly currency: CurrencyCode;
  readonly description: string;
  readonly postings: readonly Posting[];
  readonly references: JournalReferences;
}

export interface JournalEntry extends JournalEntryInput {
  readonly totalDebit: Money;
  readonly totalCredit: Money;
  /** True reversal marker set when produced by {@link reverse}. */
  readonly reversalOf?: string;
}

export class UnbalancedJournalError extends Error {
  constructor(debit: Money, credit: Money) {
    super(
      `Journal does not balance: debits=${debit.minor} credits=${credit.minor} ${debit.currency}`,
    );
    this.name = 'UnbalancedJournalError';
  }
}

export class InvalidPostingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPostingError';
  }
}

function assertPostingWellFormed(p: Posting, currency: CurrencyCode): void {
  if (p.debit.currency !== currency || p.credit.currency !== currency) {
    throw new InvalidPostingError(
      `Posting on ${p.account} uses a currency other than journal currency ${currency}`,
    );
  }
  if (p.debit.minor < 0n || p.credit.minor < 0n) {
    throw new InvalidPostingError(
      `Posting on ${p.account} has a negative amount; use the opposite side instead`,
    );
  }
  if (p.debit.minor > 0n && p.credit.minor > 0n) {
    throw new InvalidPostingError(
      `Posting on ${p.account} has both debit and credit amounts`,
    );
  }
  if (p.debit.minor === 0n && p.credit.minor === 0n) {
    throw new InvalidPostingError(`Posting on ${p.account} is empty`);
  }
  // Validate the account code is recognised (throws otherwise).
  ledgerAccountTypeOf(p.account);
}

/**
 * Build a validated, balanced journal entry. Throws if the entry does not
 * balance or a posting is malformed.
 */
export function buildJournalEntry(input: JournalEntryInput): JournalEntry {
  if (input.postings.length < 2) {
    throw new InvalidPostingError('A journal entry requires at least two postings');
  }
  let totalDebit = zero(input.currency);
  let totalCredit = zero(input.currency);
  for (const p of input.postings) {
    assertPostingWellFormed(p, input.currency);
    totalDebit = add(totalDebit, p.debit);
    totalCredit = add(totalCredit, p.credit);
  }
  if (!isZero(subtract(totalDebit, totalCredit))) {
    throw new UnbalancedJournalError(totalDebit, totalCredit);
  }
  return Object.freeze({
    ...input,
    postings: Object.freeze([...input.postings]),
    totalDebit,
    totalCredit,
  });
}

/**
 * Produce a compensating entry that reverses a posted entry (§14: reversals
 * through compensating entries, never edits). Debits and credits are swapped.
 */
export function reverse(
  entry: JournalEntry,
  reversalRef: string,
  actor: string,
  reason: string,
): JournalEntry {
  const swapped: Posting[] = entry.postings.map((p) => ({
    account: p.account,
    debit: p.credit,
    credit: p.debit,
    memo: p.memo,
  }));
  const reversed = buildJournalEntry({
    currency: entry.currency,
    description: `REVERSAL: ${entry.description} — ${reason}`,
    postings: swapped,
    references: {
      ...entry.references,
      source: reversalRef,
      actor,
    },
  });
  return Object.freeze({ ...reversed, reversalOf: entry.references.source });
}

/**
 * Signed effect of an entry on a single account, respecting the account's
 * normal balance side. Positive == increase of the account's natural balance.
 */
export function accountEffect(entry: JournalEntry, account: string): Money {
  const type = ledgerAccountTypeOf(account);
  const debitPositive =
    type === LedgerAccountType.ASSET || type === LedgerAccountType.EXPENSE;
  let net = zero(entry.currency);
  for (const p of entry.postings) {
    if (p.account !== account) continue;
    const delta = debitPositive
      ? subtract(p.debit, p.credit)
      : subtract(p.credit, p.debit);
    net = add(net, delta);
  }
  return net;
}
