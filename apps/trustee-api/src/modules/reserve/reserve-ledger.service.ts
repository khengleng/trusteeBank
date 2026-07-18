import { Injectable } from '@nestjs/common';
import { money, zero, type Money } from '@trustee/domain';
import {
  ledgerAccountTypeOf,
  LedgerAccountType,
  type JournalEntry,
} from '@trustee/ledger';
import { PrismaService } from '../../infra/prisma.service';

/**
 * Persists immutable double-entry journals (§14) and derives account balances
 * by summing postings. Entries are never edited; the balance of an account is
 * always the running sum of its postings, respecting its normal balance side.
 */
@Injectable()
export class ReserveLedgerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Persist a balanced journal entry and its postings atomically. */
  async post(entry: JournalEntry): Promise<{ id: string }> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.ledgerEntry.create({
        data: {
          programId: entry.references.programId,
          assetId: entry.references.assetId,
          currency: entry.currency,
          description: entry.description,
          source: entry.references.source,
          actor: entry.references.actor,
          approvalRef: entry.references.approvalRef ?? null,
          correlationId: entry.references.correlationId ?? null,
          reversalOf: entry.reversalOf ?? null,
          totalDebitMinor: entry.totalDebit.minor,
          totalCreditMinor: entry.totalCredit.minor,
          postings: {
            create: entry.postings.map((p) => ({
              account: p.account,
              debitMinor: p.debit.minor,
              creditMinor: p.credit.minor,
              memo: p.memo ?? null,
            })),
          },
        },
        select: { id: true },
      });
      return created;
    });
  }

  /**
   * Balance of one ledger account for a program, in the program's currency,
   * signed by the account's normal balance side (positive == natural increase).
   */
  async accountBalance(
    programId: string,
    account: string,
    currency: string,
  ): Promise<Money> {
    const rows = await this.prisma.ledgerPosting.findMany({
      where: { account, entry: { programId, currency } },
      select: { debitMinor: true, creditMinor: true },
    });
    const type = ledgerAccountTypeOf(account);
    const debitPositive =
      type === LedgerAccountType.ASSET || type === LedgerAccountType.EXPENSE;
    let net = 0n;
    for (const r of rows) {
      net += debitPositive
        ? r.debitMinor - r.creditMinor
        : r.creditMinor - r.debitMinor;
    }
    return money(net, currency);
  }

  /** Verify the whole subledger for a program balances to zero (§44 test aid). */
  async subledgerBalances(programId: string): Promise<{ balanced: boolean; net: bigint }> {
    const rows = await this.prisma.ledgerPosting.findMany({
      where: { entry: { programId } },
      select: { debitMinor: true, creditMinor: true },
    });
    let net = 0n;
    for (const r of rows) net += r.debitMinor - r.creditMinor;
    return { balanced: net === 0n, net };
  }

  zero(currency: string): Money {
    return zero(currency);
  }
}
