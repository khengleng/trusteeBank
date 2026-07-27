import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@trustee/database';
import { SigningPurpose, sha256Hex } from '@trustee/cryptography';
import { money, type Money } from '@trustee/domain';
import { LedgerAccountCode } from '@trustee/ledger';
import {
  eligibleReserve,
  reserveObligation,
  reserveRatioBps,
  mintCapacity,
  requiredSafetyBuffer,
  reserveSurplus,
} from '@trustee/reserves';
import { PrismaService } from '../../infra/prisma.service';
import { SigningService } from '../../infra/signing.service';
import { ClockService } from '../../infra/clock.service';
import { BankBalanceService } from '../../infra/bank-balance.service';
import { EventsService, PlatformEvent } from '../../events/events.service';
import { ReserveLedgerService } from './reserve-ledger.service';

export interface ReservePosition {
  programId: string;
  currency: string;
  eligibleReserve: Money;
  reserveObligation: Money;
  requiredReserve: Money;
  mintCapacity: Money;
  surplus: Money;
  reserveRatioBps: number | null;
  liabilityAgeSeconds: number | null;
}

/**
 * Computes the live reserve position (§16), mint capacity (§17), and produces
 * signed reserve snapshots / proof-of-reserve (§22). All arithmetic delegates
 * to the pure `@trustee/reserves` package.
 */
@Injectable()
export class ReserveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: ReserveLedgerService,
    private readonly signing: SigningService,
    private readonly clock: ClockService,
    private readonly events: EventsService,
    private readonly bank: BankBalanceService,
  ) {}

  async position(programId: string): Promise<ReservePosition> {
    const program = await this.prisma.program.findUnique({ where: { id: programId } });
    if (!program) throw new NotFoundException(`Program ${programId} not found`);
    const currency = program.referenceCurrency;

    // Cleared bank cash (asset) is the ledger balance of trustee bank cash.
    const clearedBankBalance = await this.ledger.accountBalance(
      programId,
      LedgerAccountCode.ASSET_TRUSTEE_BANK_CASH,
      currency,
    );
    // Unmatched deposits are held as a liability until matched (§14).
    const unmatched = await this.ledger.accountBalance(
      programId,
      LedgerAccountCode.LIABILITY_UNMATCHED_DEPOSIT,
      currency,
    );
    const pendingMint = await this.ledger.accountBalance(
      programId,
      LedgerAccountCode.LIABILITY_PENDING_MINT,
      currency,
    );
    const pendingRedemption = await this.ledger.accountBalance(
      programId,
      LedgerAccountCode.LIABILITY_PENDING_REDEMPTION,
      currency,
    );

    const latestLiability = await this.prisma.liabilitySnapshot.findFirst({
      where: { programId, signatureVerified: true },
      orderBy: { sequence: 'desc' },
    });
    const circulating = money(
      latestLiability ? latestLiability.circulatingMinor : 0n,
      currency,
    );
    const liabilityAgeSeconds = latestLiability
      ? this.clock.ageSeconds(latestLiability.snapshotTimestamp)
      : null;

    // Active reserve adjustments reduce the ELIGIBLE reserve (§16) without moving
    // cash: regulatory holds, restricted funds, operational carve-outs, charges.
    const adjustments = await this.prisma.reserveAdjustment.groupBy({
      by: ['kind'],
      where: { programId, currency, active: true },
      _sum: { amountMinor: true },
    });
    const adj = (kind: string): Money =>
      money(adjustments.find((a) => a.kind === kind)?._sum.amountMinor ?? 0n, currency);

    const eligible = eligibleReserve({
      currency,
      clearedBankBalance,
      restrictedFunds: adj('RESTRICTED'),
      unmatchedFunds: unmatched,
      pendingOutgoingPayouts: pendingRedemption,
      bankChargesDue: adj('BANK_CHARGE'),
      regulatoryHolds: adj('REGULATORY_HOLD'),
      operationalFunds: adj('OPERATIONAL'),
      otherIneligibleAmounts: this.ledger.zero(currency),
    });

    const obligation = reserveObligation({
      currency,
      circulatingSupply: circulating,
      confirmedRedemptionObligations: pendingRedemption,
      otherContractualLiabilities: this.ledger.zero(currency),
      legallyApprovedExclusions: this.ledger.zero(currency),
    });

    const buffer = requiredSafetyBuffer(obligation, program.safetyBufferBps);
    const requiredReserve = money(
      (obligation.minor * BigInt(program.requiredRatioBps)) / 10000n,
      currency,
    );

    const capacity = mintCapacity({
      currency,
      eligibleReserve: eligible,
      existingReserveObligation: obligation,
      requiredSafetyBuffer: buffer,
      pendingMintAuthorizations: pendingMint,
    });

    return {
      programId,
      currency,
      eligibleReserve: eligible,
      reserveObligation: obligation,
      requiredReserve,
      mintCapacity: capacity,
      surplus: reserveSurplus(eligible, requiredReserve),
      reserveRatioBps: reserveRatioBps(eligible, obligation),
      liabilityAgeSeconds,
    };
  }

  /** Create a signed reserve snapshot / proof-of-reserve (§22). */
  async createSnapshot(programId: string): Promise<{ id: string; ratioBps: number | null }> {
    const pos = await this.position(programId);
    const content = {
      programId,
      assetId: (await this.program(programId)).assetId,
      referenceCurrency: pos.currency,
      timestamp: this.clock.nowIso(),
      eligibleReserveMinor: pos.eligibleReserve.minor.toString(),
      circulatingLiabilityMinor: pos.reserveObligation.minor.toString(),
      requiredReserveMinor: pos.requiredReserve.minor.toString(),
      surplusMinor: pos.surplus.minor.toString(),
      reserveRatioBps: pos.reserveRatioBps,
      dataSources: ['reserve-subledger', 'paychain-liability-feed'],
    };
    const contentHash = sha256Hex(JSON.stringify(content));
    const signature = this.signing.sign(SigningPurpose.RESERVE_SNAPSHOT, content);

    const snapshot = await this.prisma.reserveSnapshot.create({
      data: {
        programId,
        assetId: content.assetId,
        referenceCurrency: pos.currency,
        eligibleReserveMinor: pos.eligibleReserve.minor,
        excludedAmountMinor: 0n,
        circulatingLiabilityMinor: pos.reserveObligation.minor,
        pendingRedemptionMinor: 0n,
        requiredReserveMinor: pos.requiredReserve.minor,
        reserveRatioBps: pos.reserveRatioBps,
        surplusMinor: pos.surplus.minor,
        reconciliationStatus: pos.surplus.minor >= 0n ? 'OK' : 'SHORTFALL',
        dataSources: content.dataSources,
        signatureKeyId: signature.keyId,
        signatureValue: signature.value,
        contentHash,
      },
      select: { id: true },
    });

    // Emit the artifact-bearing reserve evidence PayChain corroborates minting on
    // (trustee-events-contract §reserve.snapshot.created).
    const program = await this.program(programId);
    await this.events.publishWithArtifact(
      PlatformEvent.RESERVE_SNAPSHOT_CREATED,
      { snapshotId: snapshot.id, programId, reserveRatioBps: pos.reserveRatioBps },
      {
        snapshotId: snapshot.id,
        tenantId: program.issuerId,
        assetId: content.assetId,
        reserveBalance: pos.eligibleReserve.minor.toString(),
        currency: pos.currency,
        asOf: content.timestamp,
      },
      SigningPurpose.RESERVE_SNAPSHOT,
    );
    if (pos.surplus.minor < 0n) {
      await this.events.publish(PlatformEvent.RESERVE_SHORTFALL_DETECTED, {
        programId,
        shortfallMinor: pos.surplus.minor.toString(),
      });
    }
    return { id: snapshot.id, ratioBps: pos.reserveRatioBps };
  }

  /** Latest signed reserve snapshot for a program (§22 read). */
  async latestSnapshot(programId: string) {
    const s = await this.prisma.reserveSnapshot.findFirst({
      where: { programId },
      orderBy: { createdAt: 'desc' },
    });
    if (!s) throw new NotFoundException(`No reserve snapshot for program ${programId}`);
    return serializeSnapshot(s);
  }

  /** Fetch a specific reserve snapshot by id (§22 read). */
  async getSnapshot(snapshotId: string) {
    const s = await this.prisma.reserveSnapshot.findUnique({ where: { id: snapshotId } });
    if (!s) throw new NotFoundException(`Snapshot ${snapshotId} not found`);
    return serializeSnapshot(s);
  }

  /** Snapshot history for a program (§27 GET /reserves/history). */
  async snapshotHistory(programId: string, limit = 50) {
    const rows = await this.prisma.reserveSnapshot.findMany({
      where: { programId }, orderBy: { createdAt: 'desc' }, take: Math.min(limit, 200),
    });
    return { snapshots: rows.map(serializeSnapshot) };
  }

  /** Reserve ratio only (§27 GET /reserves/ratio). */
  async ratio(programId: string) {
    const pos = await this.position(programId);
    return { programId, reserveRatioBps: pos.reserveRatioBps, asOf: this.clock.nowIso() };
  }

  /** Trustee reserve accounts (masked) — §27 GET /reserve-accounts. */
  async listAccounts(programId?: string) {
    const accounts = await this.prisma.trusteeAccount.findMany({
      where: programId ? { programId } : undefined,
      select: {
        id: true, maskedAccountNumber: true, accountName: true, bankLegalEntity: true,
        currency: true, classification: true, status: true, programId: true, supportedAssetId: true,
      },
    });
    return { accounts };
  }

  async getAccount(accountId: string) {
    const a = await this.prisma.trusteeAccount.findUnique({
      where: { id: accountId },
      select: {
        id: true, maskedAccountNumber: true, accountName: true, bankLegalEntity: true,
        currency: true, classification: true, status: true, programId: true, supportedAssetId: true,
      },
    });
    if (!a) throw new NotFoundException(`Reserve account ${accountId} not found`);
    return a;
  }

  /** Balance for a reserve account, via its program's live reserve position. */
  async accountBalance(accountId: string) {
    const a = await this.prisma.trusteeAccount.findUnique({ where: { id: accountId } });
    if (!a) throw new NotFoundException(`Reserve account ${accountId} not found`);
    const pos = await this.position(a.programId);
    return {
      accountId,
      currency: pos.currency,
      eligibleReserveMinor: pos.eligibleReserve.minor.toString(),
      mintCapacityMinor: pos.mintCapacity.minor.toString(),
      asOf: this.clock.nowIso(),
    };
  }

  // --- Reserve adjustments (§16) ---

  async addAdjustment(input: {
    programId: string; kind: string; amountMinor: string; reason?: string; actor: string;
  }) {
    const program = await this.program(input.programId);
    const kinds = ['RESTRICTED', 'REGULATORY_HOLD', 'OPERATIONAL', 'BANK_CHARGE'];
    if (!kinds.includes(input.kind)) {
      throw new NotFoundException(`Unknown adjustment kind ${input.kind}`);
    }
    const a = await this.prisma.reserveAdjustment.create({
      data: {
        programId: input.programId,
        currency: program.referenceCurrency,
        kind: input.kind,
        amountMinor: BigInt(input.amountMinor),
        reason: input.reason ?? null,
        createdBy: input.actor,
      },
    });
    return { id: a.id, kind: a.kind, amountMinor: a.amountMinor.toString(), active: a.active };
  }

  async liftAdjustment(id: string, actor: string) {
    const a = await this.prisma.reserveAdjustment.update({
      where: { id },
      data: { active: false, liftedBy: actor },
    });
    return { id: a.id, active: a.active };
  }

  async listAdjustments(programId: string) {
    const rows = await this.prisma.reserveAdjustment.findMany({
      where: { programId, active: true },
    });
    return {
      adjustments: rows.map((a) => ({
        id: a.id, kind: a.kind, amountMinor: a.amountMinor.toString(), reason: a.reason,
      })),
    };
  }

  /**
   * Reconcile the internal reserve ledger cash against the banks' reported
   * balances (§26), aggregated across ALL of a program's accounts — the reserve
   * may be spread over many banks. Each account resolves to its own bank
   * connection (mock / api / manual). Proves the ledger rather than trusting it;
   * records a reconciliation exception on drift. Accounts on manual/offline banks
   * are reported as uncovered rather than silently assumed correct.
   *
   * Money of different currencies is never added (§14): the ledger cash balance
   * is read per-currency, so only accounts denominated in the program reference
   * currency take part in the comparison. Accounts in another currency are
   * reported as out-of-scope, and a bank that reports a balance in an unexpected
   * currency counts as a mismatch — not as reserve.
   */
  async reconcileBank(programId: string) {
    const program = await this.program(programId);
    const currency = program.referenceCurrency;
    const accounts = await this.prisma.trusteeAccount.findMany({
      where: { programId },
      select: { id: true, bankId: true, coreBankingRef: true, currency: true, mockClearedMinor: true },
    });
    const ledgerCash = await this.ledger.accountBalance(
      programId,
      LedgerAccountCode.ASSET_TRUSTEE_BANK_CASH,
      currency,
    );

    let bankTotal = 0n;
    let uncovered = 0;
    let mismatched = 0;
    const perBank: Array<{
      accountId: string;
      bankId: string | null;
      source: string;
      currency: string;
      balanceMinor: string | null;
      inScope: boolean;
      note?: string;
    }> = [];
    const outOfScope = accounts.filter((a) => a.currency !== currency);
    for (const acc of accounts) {
      if (acc.currency !== currency) {
        // A different-currency account is safeguarded under its own currency's
        // cash ledger; including it here would compare unlike money.
        perBank.push({
          accountId: acc.id, bankId: acc.bankId, source: 'out-of-scope', currency: acc.currency,
          balanceMinor: null, inScope: false,
          note: `denominated in ${acc.currency}, program reference currency is ${currency}`,
        });
        continue;
      }
      const bal = await this.bank.clearedBalanceForAccount(acc);
      if (!bal) {
        uncovered += 1;
        perBank.push({ accountId: acc.id, bankId: acc.bankId, source: 'manual', currency: acc.currency, balanceMinor: null, inScope: true });
        continue;
      }
      if (bal.currency !== currency) {
        // The bank answered in a currency we did not ask for — treat as an
        // unverified account rather than folding a foreign amount into the total.
        mismatched += 1;
        uncovered += 1;
        perBank.push({
          accountId: acc.id, bankId: bal.bankId, source: bal.source, currency: bal.currency,
          balanceMinor: bal.minor.toString(), inScope: true,
          note: `bank reported ${bal.currency}, expected ${currency} — excluded from the total`,
        });
        continue;
      }
      bankTotal += bal.minor;
      perBank.push({ accountId: acc.id, bankId: bal.bankId, source: bal.source, currency: bal.currency, balanceMinor: bal.minor.toString(), inScope: true });
    }

    const inScope = accounts.length - outOfScope.length;
    const covered = inScope - uncovered;
    const drift = bankTotal - ledgerCash.minor;
    // Only assert reconciliation when every in-scope account was independently covered.
    const reconciled = uncovered === 0 ? drift === 0n : null;
    if (reconciled === false) {
      // Persist the exception, not just an event — an unresolved exception is what
      // blocks further issuance (§17 RECONCILIATION_UNRESOLVED / CO-10).
      await this.recordBankDrift(programId, {
        ledgerCashMinor: ledgerCash.minor.toString(),
        bankTotalMinor: bankTotal.toString(),
        driftMinor: drift.toString(),
        currency,
        accountsCovered: covered,
      });
    }
    const notes = [
      uncovered > 0 ? `${uncovered} in-scope account(s) not independently verified.` : null,
      mismatched > 0 ? `${mismatched} account(s) returned a currency other than ${currency}.` : null,
      outOfScope.length > 0 ? `${outOfScope.length} account(s) out of scope (other currency).` : null,
    ].filter(Boolean);
    return {
      programId,
      currency,
      ledgerCashMinor: ledgerCash.minor.toString(),
      bankTotalMinor: bankTotal.toString(),
      driftMinor: drift.toString(),
      reconciled,
      accountsInScope: inScope,
      accountsCovered: covered,
      accountsUncovered: uncovered,
      accountsCurrencyMismatched: mismatched,
      accountsOutOfScope: outOfScope.length,
      banks: perBank,
      note: notes.length ? notes.join(' ') : undefined,
      asOf: this.clock.nowIso(),
    };
  }

  /**
   * Record a bank-vs-ledger drift as a reconciliation run + open exception, so it
   * is visible in the exception queue AND fails the mint guard until an operator
   * resolves it (§24, §49 "when uncertain: stop minting").
   *
   * Reconciliation is safe to re-run, so an unresolved drift is only raised once:
   * re-running while the same drift persists must not bury the operator in
   * duplicates. A drift that is resolved and then recurs raises a fresh one.
   */
  private async recordBankDrift(programId: string, detail: Record<string, string | number>) {
    const alreadyOpen = await this.prisma.reconciliationException.findFirst({
      where: { resolved: false, type: 'BANK_LEDGER_DRIFT', run: { programId } },
      select: { id: true },
    });
    if (alreadyOpen) return;

    const run = await this.prisma.reconciliationRun.create({
      data: {
        scope: 'RESERVE_BANK',
        programId,
        status: 'EXCEPTIONS',
        summary: detail as Prisma.InputJsonValue,
        createdBy: 'system:bank-reconcile',
        exceptions: { create: [{ type: 'BANK_LEDGER_DRIFT', detail: detail as Prisma.InputJsonValue }] },
      },
      select: { id: true },
    });
    await this.events.publish(PlatformEvent.RECONCILIATION_EXCEPTION_CREATED, {
      runId: run.id,
      programId,
      type: 'BANK_LEDGER_DRIFT',
      ...detail,
    });
  }

  /** Reserve accounts for a program, with their bank + mock balance (§26). */
  async listProgramAccounts(programId: string) {
    const rows = await this.prisma.trusteeAccount.findMany({
      where: { programId },
      select: {
        id: true, maskedAccountNumber: true, accountName: true, bankLegalEntity: true,
        currency: true, classification: true, status: true, bankId: true,
        mockClearedMinor: true, coreBankingRef: true,
      },
    });
    return {
      accounts: rows.map((a) => ({
        id: a.id, maskedAccountNumber: a.maskedAccountNumber, accountName: a.accountName,
        bankLegalEntity: a.bankLegalEntity, currency: a.currency, classification: a.classification,
        status: a.status, bankId: a.bankId, coreBankingRef: a.coreBankingRef,
        mockClearedMinor: a.mockClearedMinor.toString(),
      })),
    };
  }

  // --- Multi-bank registry (§26) ---

  async registerBank(input: {
    bankId: string; bankLegalName: string; country?: string;
    integrationMode?: string; baseUrl?: string; authTokenEnv?: string; actor: string;
  }) {
    const modes = ['MOCK', 'API', 'MANUAL', 'STATEMENT'];
    const mode = input.integrationMode ?? 'MOCK';
    if (!modes.includes(mode)) throw new NotFoundException(`Unknown integrationMode ${mode}`);
    const conn = await this.prisma.bankConnection.upsert({
      where: { bankId: input.bankId },
      update: {
        bankLegalName: input.bankLegalName,
        country: input.country ?? null,
        integrationMode: mode,
        baseUrl: input.baseUrl ?? null,
        authTokenEnv: input.authTokenEnv ?? null,
      },
      create: {
        bankId: input.bankId,
        bankLegalName: input.bankLegalName,
        country: input.country ?? null,
        integrationMode: mode,
        baseUrl: input.baseUrl ?? null,
        authTokenEnv: input.authTokenEnv ?? null,
        createdBy: input.actor,
      },
    });
    return { id: conn.id, bankId: conn.bankId, integrationMode: conn.integrationMode, status: conn.status };
  }

  async listBanks() {
    const rows = await this.prisma.bankConnection.findMany();
    return {
      banks: rows.map((b) => ({
        bankId: b.bankId, bankLegalName: b.bankLegalName, country: b.country,
        integrationMode: b.integrationMode, baseUrl: b.baseUrl, status: b.status,
      })),
    };
  }

  /** Link a trustee account to a bank and/or set its mock cleared balance (§26). */
  async setAccountBank(accountId: string, input: { bankId?: string; mockClearedMinor?: string }) {
    const acc = await this.prisma.trusteeAccount.findUnique({ where: { id: accountId } });
    if (!acc) throw new NotFoundException(`Reserve account ${accountId} not found`);
    if (input.bankId) {
      const conn = await this.prisma.bankConnection.findUnique({ where: { bankId: input.bankId } });
      if (!conn) throw new NotFoundException(`Bank connection ${input.bankId} not registered`);
    }
    const updated = await this.prisma.trusteeAccount.update({
      where: { id: accountId },
      data: {
        bankId: input.bankId ?? acc.bankId,
        mockClearedMinor: input.mockClearedMinor !== undefined ? BigInt(input.mockClearedMinor) : acc.mockClearedMinor,
      },
    });
    return {
      accountId: updated.id,
      bankId: updated.bankId,
      mockClearedMinor: updated.mockClearedMinor.toString(),
    };
  }

  private async program(programId: string) {
    const p = await this.prisma.program.findUnique({ where: { id: programId } });
    if (!p) throw new NotFoundException(`Program ${programId} not found`);
    return p;
  }
}

function serializeSnapshot(s: {
  id: string; programId: string; assetId: string; referenceCurrency: string;
  eligibleReserveMinor: bigint; circulatingLiabilityMinor: bigint; requiredReserveMinor: bigint;
  surplusMinor: bigint; reserveRatioBps: number | null; reconciliationStatus: string;
  signatureKeyId: string; signatureValue: string; contentHash: string; createdAt: Date;
}) {
  return {
    snapshotId: s.id,
    programId: s.programId,
    assetId: s.assetId,
    referenceCurrency: s.referenceCurrency,
    eligibleReserveMinor: s.eligibleReserveMinor.toString(),
    circulatingLiabilityMinor: s.circulatingLiabilityMinor.toString(),
    requiredReserveMinor: s.requiredReserveMinor.toString(),
    surplusMinor: s.surplusMinor.toString(),
    reserveRatioBps: s.reserveRatioBps,
    reconciliationStatus: s.reconciliationStatus,
    signature: { keyId: s.signatureKeyId, value: s.signatureValue, algorithm: 'ed25519' },
    contentHash: s.contentHash,
    createdAt: s.createdAt.toISOString(),
  };
}
