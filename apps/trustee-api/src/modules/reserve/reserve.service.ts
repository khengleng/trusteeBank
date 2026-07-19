import { Injectable, NotFoundException } from '@nestjs/common';
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

    const eligible = eligibleReserve({
      currency,
      clearedBankBalance,
      restrictedFunds: this.ledger.zero(currency),
      unmatchedFunds: unmatched,
      pendingOutgoingPayouts: pendingRedemption,
      bankChargesDue: this.ledger.zero(currency),
      regulatoryHolds: this.ledger.zero(currency),
      operationalFunds: this.ledger.zero(currency),
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
