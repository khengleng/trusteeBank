import { describe, it, expect } from 'vitest';
import { money, zero } from '@trustee/domain';
import {
  buildJournalEntry,
  reverse,
  accountEffect,
  UnbalancedJournalError,
  InvalidPostingError,
  type JournalReferences,
} from './journal';
import { LedgerAccountCode } from './accounts';
import { clearedDepositEntry, mintReservationEntry } from './entries';

const refs: JournalReferences = {
  source: 'deposit:dep_1',
  programId: 'prog_1',
  assetId: 'asset_1',
  actor: 'svc:test',
};

describe('journal', () => {
  it('accepts a balanced entry', () => {
    const e = clearedDepositEntry(money(100_00n, 'USD'), refs);
    expect(e.totalDebit.minor).toBe(100_00n);
    expect(e.totalCredit.minor).toBe(100_00n);
  });

  it('rejects an unbalanced entry', () => {
    expect(() =>
      buildJournalEntry({
        currency: 'USD',
        description: 'bad',
        postings: [
          { account: LedgerAccountCode.ASSET_TRUSTEE_BANK_CASH, debit: money(100n, 'USD'), credit: zero('USD') },
          { account: LedgerAccountCode.LIABILITY_PAYCHAIN_RESERVE_OBLIGATION, debit: zero('USD'), credit: money(99n, 'USD') },
        ],
        references: refs,
      }),
    ).toThrow(UnbalancedJournalError);
  });

  it('rejects a posting with both debit and credit', () => {
    expect(() =>
      buildJournalEntry({
        currency: 'USD',
        description: 'bad',
        postings: [
          { account: LedgerAccountCode.ASSET_TRUSTEE_BANK_CASH, debit: money(1n, 'USD'), credit: money(1n, 'USD') },
          { account: LedgerAccountCode.LIABILITY_PAYCHAIN_RESERVE_OBLIGATION, debit: zero('USD'), credit: money(1n, 'USD') },
        ],
        references: refs,
      }),
    ).toThrow(InvalidPostingError);
  });

  it('rejects unknown account codes', () => {
    expect(() =>
      buildJournalEntry({
        currency: 'USD',
        description: 'bad',
        postings: [
          { account: 'MADE_UP:THING', debit: money(1n, 'USD'), credit: zero('USD') },
          { account: LedgerAccountCode.LIABILITY_PAYCHAIN_RESERVE_OBLIGATION, debit: zero('USD'), credit: money(1n, 'USD') },
        ],
        references: refs,
      }),
    ).toThrow();
  });

  it('reversal swaps sides and remains balanced', () => {
    const e = clearedDepositEntry(money(500n, 'USD'), refs);
    const r = reverse(e, 'reversal:rev_1', 'user:supervisor', 'error correction');
    expect(r.reversalOf).toBe('deposit:dep_1');
    expect(r.totalDebit.minor).toBe(500n);
    // Net effect of entry + reversal on bank cash is zero.
    const net =
      accountEffect(e, LedgerAccountCode.ASSET_TRUSTEE_BANK_CASH).minor +
      accountEffect(r, LedgerAccountCode.ASSET_TRUSTEE_BANK_CASH).minor;
    expect(net).toBe(0n);
  });

  it('accountEffect respects normal balance side', () => {
    const e = clearedDepositEntry(money(100n, 'USD'), refs);
    // Asset debit increases cash (+100); liability credit increases obligation (+100)
    expect(accountEffect(e, LedgerAccountCode.ASSET_TRUSTEE_BANK_CASH).minor).toBe(100n);
    expect(
      accountEffect(e, LedgerAccountCode.LIABILITY_PAYCHAIN_RESERVE_OBLIGATION).minor,
    ).toBe(100n);
  });

  it('mint reservation moves obligation into pending mint', () => {
    const e = mintReservationEntry(money(250n, 'USD'), refs);
    expect(
      accountEffect(e, LedgerAccountCode.LIABILITY_PAYCHAIN_RESERVE_OBLIGATION).minor,
    ).toBe(-250n);
    expect(accountEffect(e, LedgerAccountCode.LIABILITY_PENDING_MINT).minor).toBe(250n);
  });
});
