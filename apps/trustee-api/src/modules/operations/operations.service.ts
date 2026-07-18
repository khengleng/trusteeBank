import { Injectable, NotFoundException } from '@nestjs/common';
import { ledgerAccountTypeOf, LedgerAccountType } from '@trustee/ledger';
import { PrismaService } from '../../infra/prisma.service';
import { ReserveService } from '../reserve/reserve.service';

/**
 * Read models powering the trustee admin operational workbench (§31 portals):
 * work queues (ops), trial balance & journal (accountant), reserve/liability
 * reports (CFO/treasury), reconciliation (risk) and audit (compliance). All
 * read-only and trustee-bank scoped; actions are the existing /bank routes.
 */
@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reserve: ReserveService,
  ) {}

  /** Actionable work queues across the platform (§31 operations portal). */
  async queues() {
    const [mint, redemptions, deposits, settlements] = await Promise.all([
      this.prisma.mintAuthorization.findMany({
        where: { status: { in: ['PENDING_MAKER', 'PENDING_CHECKER'] } },
        orderBy: { createdAt: 'asc' }, take: 100, include: { approval: true },
      }),
      this.prisma.redemption.findMany({
        where: { status: { in: ['AWAITING_APPROVAL', 'APPROVED', 'BURN_CONFIRMED', 'PAYOUT_SUBMITTED'] } },
        orderBy: { createdAt: 'asc' }, take: 100,
      }),
      this.prisma.deposit.findMany({
        where: { status: { in: ['DETECTED', 'UNMATCHED', 'MATCHED'] } },
        orderBy: { createdAt: 'asc' }, take: 100,
      }),
      this.prisma.paykhSettlement.findMany({
        where: { status: { in: ['REQUESTED', 'APPROVED', 'SUBMITTED'] } },
        orderBy: { createdAt: 'asc' }, take: 100,
      }),
    ]);
    return {
      mint: mint.map((m) => ({
        id: m.id, programId: m.programId, amountMinor: m.amountMinor.toString(), currency: m.currency,
        status: m.status, makerId: m.approval?.makerId ?? null, paychainRequestId: m.paychainRequestId,
      })),
      redemptions: redemptions.map((r) => ({
        id: r.id, programId: r.programId, amountMinor: r.amountMinor.toString(), currency: r.currency,
        status: r.status, beneficiaryName: r.beneficiaryName, burnTxHash: r.burnTxHash,
      })),
      deposits: deposits.map((d) => ({
        id: d.id, programId: d.programId, amountMinor: d.amountMinor.toString(), currency: d.currency,
        status: d.status, bankTransactionId: d.bankTransactionId, fundingInstructionId: d.fundingInstructionId,
      })),
      settlements: settlements.map((s) => ({
        id: s.id, tenantId: s.tenantId, merchantId: s.merchantId, amountMinor: s.amountMinor.toString(),
        currency: s.currency, status: s.status,
      })),
      counts: { mint: mint.length, redemptions: redemptions.length, deposits: deposits.length, settlements: settlements.length },
    };
  }

  /** Trial balance: signed balance per ledger account for a program (§14). */
  async trialBalance(programId: string) {
    const rows = await this.prisma.ledgerPosting.groupBy({
      by: ['account'],
      where: { entry: { programId } },
      _sum: { debitMinor: true, creditMinor: true },
    });
    let totalDebit = 0n, totalCredit = 0n;
    const accounts = rows.map((r) => {
      const debit = r._sum.debitMinor ?? 0n;
      const credit = r._sum.creditMinor ?? 0n;
      totalDebit += debit; totalCredit += credit;
      const type = ledgerAccountTypeOf(r.account);
      const debitNormal = type === LedgerAccountType.ASSET || type === LedgerAccountType.EXPENSE;
      const balance = debitNormal ? debit - credit : credit - debit;
      return { account: r.account, type, debitMinor: debit.toString(), creditMinor: credit.toString(), balanceMinor: balance.toString() };
    });
    return {
      programId, accounts,
      totals: { debitMinor: totalDebit.toString(), creditMinor: totalCredit.toString(), balanced: totalDebit === totalCredit },
    };
  }

  /** Recent immutable journal entries with postings (§14). */
  async ledgerEntries(programId: string, limit = 50) {
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { programId }, orderBy: { postedAt: 'desc' }, take: Math.min(limit, 200),
      include: { postings: true },
    });
    return {
      entries: entries.map((e) => ({
        id: e.id, description: e.description, source: e.source, actor: e.actor, reversalOf: e.reversalOf,
        currency: e.currency, postedAt: e.postedAt.toISOString(),
        postings: e.postings.map((p) => ({ account: p.account, debitMinor: p.debitMinor.toString(), creditMinor: p.creditMinor.toString() })),
      })),
    };
  }

  /** Audit-log viewer (§34) with light filtering. */
  async auditLogs(filter: { subjectType?: string; action?: string; actor?: string; limit?: number }) {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        subjectType: filter.subjectType || undefined,
        action: filter.action ? { contains: filter.action } : undefined,
        actor: filter.actor ? { contains: filter.actor } : undefined,
      },
      orderBy: { createdAt: 'desc' }, take: Math.min(filter.limit ?? 100, 500),
    });
    return {
      logs: logs.map((l) => ({
        id: l.id, actor: l.actor, actorRole: l.actorRole, action: l.action, subjectType: l.subjectType,
        subjectId: l.subjectId, reason: l.reason, createdAt: l.createdAt.toISOString(),
      })),
    };
  }

  /** Daily reserve report data (§35) — CFO/treasury. */
  async reserveReport(programId: string) {
    const pos = await this.reserve.position(programId);
    const latest = await this.prisma.reserveSnapshot.findFirst({ where: { programId }, orderBy: { createdAt: 'desc' } });
    const program = await this.prisma.program.findUnique({ where: { id: programId } });
    if (!program) throw new NotFoundException('Program not found');
    return {
      programId, code: program.code, currency: pos.currency,
      eligibleReserveMinor: pos.eligibleReserve.minor.toString(),
      reserveObligationMinor: pos.reserveObligation.minor.toString(),
      requiredReserveMinor: pos.requiredReserve.minor.toString(),
      mintCapacityMinor: pos.mintCapacity.minor.toString(),
      surplusMinor: pos.surplus.minor.toString(),
      reserveRatioBps: pos.reserveRatioBps,
      liabilityAgeSeconds: pos.liabilityAgeSeconds,
      latestSnapshotAt: latest?.createdAt.toISOString() ?? null,
    };
  }

  /** Liability report data (§35) from the latest verified feed. */
  async liabilityReport(programId: string) {
    const latest = await this.prisma.liabilitySnapshot.findFirst({
      where: { programId, signatureVerified: true }, orderBy: { sequence: 'desc' },
    });
    if (!latest) return { programId, liability: null };
    return {
      programId,
      liability: {
        assetCode: latest.assetCode, blockchainNetwork: latest.blockchainNetwork,
        circulatingMinor: latest.circulatingMinor.toString(), pendingMintMinor: latest.pendingMintMinor.toString(),
        pendingRedemptionMinor: latest.pendingRedemptionMinor.toString(),
        effectiveLiabilityMinor: latest.effectiveLiabilityMinor.toString(),
        currency: latest.currency, sequence: latest.sequence.toString(),
        snapshotTimestamp: latest.snapshotTimestamp.toISOString(),
      },
    };
  }

  /** Recent reconciliation runs with exception counts (§24) — risk. */
  async reconciliationRuns(limit = 50) {
    const runs = await this.prisma.reconciliationRun.findMany({
      orderBy: { createdAt: 'desc' }, take: Math.min(limit, 200), include: { _count: { select: { exceptions: true } } },
    });
    return {
      runs: runs.map((r) => ({
        id: r.id, scope: r.scope, programId: r.programId, tenantId: r.tenantId, status: r.status,
        exceptionCount: r._count.exceptions, createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async attestations() {
    const attestations = await this.prisma.attestation.findMany({
      orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, period: true, scope: true, status: true, auditor: true, programId: true, createdAt: true },
    });
    return { attestations };
  }

  /** Programs list for pickers. */
  async programs() {
    const programs = await this.prisma.program.findMany({
      select: { id: true, code: true, referenceCurrency: true, status: true },
    });
    return { programs };
  }
}
