import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { money, RedemptionStatus } from '@trustee/domain';
import { redemptionObligationEntry, payoutConfirmedEntry } from '@trustee/ledger';
import { PrismaService } from '../../infra/prisma.service';
import { ClockService } from '../../infra/clock.service';
import { AuditService } from '../../infra/audit.service';
import { FeatureFlagsService } from '../../infra/feature-flags.service';
import { EventsService, PlatformEvent } from '../../events/events.service';
import { ReserveLedgerService } from '../reserve/reserve-ledger.service';

export interface RequestRedemption {
  programId: string;
  paychainRedemptionId: string;
  amountMinor: string;
  beneficiaryName: string;
  beneficiaryAccountMasked: string;
  correlationId?: string;
}

/**
 * Redemption & payout workflow (§20, §21, §45 part 2). Never marks a redemption
 * complete before the asset burn is confirmed AND the fiat payout is confirmed
 * (§20/§49). Payout details cannot change after approval without restarting
 * approval (§21). Uses double-entry postings for the obligation and payout.
 */
@Injectable()
export class RedemptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
    private readonly flags: FeatureFlagsService,
    private readonly events: EventsService,
    private readonly ledger: ReserveLedgerService,
  ) {}

  /** PayChain submits a redemption request (§20). */
  async request(input: RequestRedemption) {
    const program = await this.prisma.program.findUnique({ where: { id: input.programId } });
    if (!program) throw new NotFoundException('Program not found');
    if (!(await this.flags.isEnabled('paychain.redemption.enabled'))) {
      throw new BadRequestException('Redemption is disabled');
    }
    const amount = money(BigInt(input.amountMinor), program.referenceCurrency);
    if (amount.minor <= 0n) throw new BadRequestException('Amount must be positive');

    const r = await this.prisma.redemption.create({
      data: {
        programId: input.programId,
        paychainRedemptionId: input.paychainRedemptionId,
        assetId: program.assetId,
        amountMinor: amount.minor,
        currency: program.referenceCurrency,
        beneficiaryName: input.beneficiaryName,
        beneficiaryAccountMasked: input.beneficiaryAccountMasked,
        correlationId: input.correlationId ?? null,
        status: RedemptionStatus.AWAITING_APPROVAL,
      },
    });
    await this.audit.record({
      actor: `paychain:${input.paychainRedemptionId}`,
      action: 'redemption.requested',
      subjectType: 'REDEMPTION',
      subjectId: r.id,
      correlationId: input.correlationId,
      afterState: { amountMinor: input.amountMinor },
    });
    return { id: r.id, status: r.status };
  }

  /** Trustee approves the redemption; recognises the obligation (§20). */
  async approve(redemptionId: string, approverId: string, reason: string) {
    const r = await this.require(redemptionId);
    if (r.status !== RedemptionStatus.AWAITING_APPROVAL) {
      throw new BadRequestException(`Redemption is ${r.status}, not awaiting approval`);
    }
    const approver = await this.prisma.user.findUnique({ where: { id: approverId } });
    if (!approver || approver.institution !== 'TRUSTEE_BANK') {
      throw new BadRequestException('Approver must be a trustee-bank user');
    }
    // Move reserve obligation into a pending-redemption liability (§14).
    await this.ledger.post(
      redemptionObligationEntry(money(r.amountMinor, r.currency), {
        source: `redemption:${redemptionId}`,
        programId: r.programId,
        assetId: r.assetId,
        actor: approverId,
      }),
    );
    await this.prisma.redemption.update({
      where: { id: redemptionId },
      data: { status: RedemptionStatus.APPROVED, approvedById: approverId },
    });
    await this.audit.record({
      actor: approverId,
      action: 'redemption.approved',
      subjectType: 'REDEMPTION',
      subjectId: redemptionId,
      reason,
    });
    await this.events.publish(PlatformEvent.REDEMPTION_APPROVED, { redemptionId, programId: r.programId });
    return { id: redemptionId, status: RedemptionStatus.APPROVED };
  }

  /** PayChain confirms the asset lock/burn (§20). Requires prior approval. */
  async confirmBurn(redemptionId: string, burnTxHash: string, actor: string) {
    const r = await this.require(redemptionId);
    if (r.status !== RedemptionStatus.APPROVED && r.status !== RedemptionStatus.ASSET_LOCKED) {
      throw new BadRequestException(`Redemption must be APPROVED before burn, is ${r.status}`);
    }
    await this.prisma.redemption.update({
      where: { id: redemptionId },
      data: { status: RedemptionStatus.BURN_CONFIRMED, burnTxHash, burnConfirmedAt: this.clock.now() },
    });
    await this.audit.record({
      actor,
      action: 'redemption.burn.confirmed',
      subjectType: 'REDEMPTION',
      subjectId: redemptionId,
      afterState: { burnTxHash },
    });
    await this.events.publish(PlatformEvent.REDEMPTION_BURN_CONFIRMED, { redemptionId, burnTxHash });
    return { id: redemptionId, status: RedemptionStatus.BURN_CONFIRMED };
  }

  /** Trustee submits the fiat payout — only after burn is confirmed (§21/§49). */
  async submitPayout(redemptionId: string, actor: string) {
    const r = await this.require(redemptionId);
    if (r.status !== RedemptionStatus.BURN_CONFIRMED) {
      throw new BadRequestException(`Cannot pay out before burn is confirmed (is ${r.status})`);
    }
    if (!(await this.flags.isEnabled('bank.payout.enabled'))) {
      throw new BadRequestException('Payout execution is disabled (bank.payout.enabled)');
    }
    const payoutReference = `PO-${randomUUID().slice(0, 10).toUpperCase()}`;
    await this.prisma.redemption.update({
      where: { id: redemptionId },
      data: { status: RedemptionStatus.PAYOUT_SUBMITTED, payoutReference, payoutSubmittedAt: this.clock.now() },
    });
    await this.audit.record({
      actor,
      action: 'redemption.payout.submitted',
      subjectType: 'REDEMPTION',
      subjectId: redemptionId,
      afterState: { payoutReference },
    });
    await this.events.publish(PlatformEvent.REDEMPTION_PAYOUT_SUBMITTED, { redemptionId, payoutReference });
    return { id: redemptionId, status: RedemptionStatus.PAYOUT_SUBMITTED, payoutReference };
  }

  /** Bank confirms settlement; discharge the liability and complete (§20). */
  async confirmPayout(redemptionId: string, actor: string) {
    const r = await this.require(redemptionId);
    if (r.status !== RedemptionStatus.PAYOUT_SUBMITTED) {
      throw new BadRequestException(`Redemption must be PAYOUT_SUBMITTED to confirm, is ${r.status}`);
    }
    // Discharge the pending-redemption liability against bank cash (§14).
    await this.ledger.post(
      payoutConfirmedEntry(money(r.amountMinor, r.currency), {
        source: `redemption-payout:${redemptionId}`,
        programId: r.programId,
        assetId: r.assetId,
        actor,
      }),
    );
    await this.prisma.redemption.update({
      where: { id: redemptionId },
      data: {
        status: RedemptionStatus.COMPLETED,
        payoutConfirmedAt: this.clock.now(),
        completedAt: this.clock.now(),
      },
    });
    await this.audit.record({
      actor,
      action: 'redemption.completed',
      subjectType: 'REDEMPTION',
      subjectId: redemptionId,
    });
    await this.events.publish(PlatformEvent.REDEMPTION_PAYOUT_CONFIRMED, { redemptionId });
    await this.events.publish(PlatformEvent.REDEMPTION_COMPLETED, { redemptionId });
    return { id: redemptionId, status: RedemptionStatus.COMPLETED };
  }

  async get(redemptionId: string) {
    const r = await this.require(redemptionId);
    return {
      id: r.id,
      status: r.status,
      amountMinor: r.amountMinor.toString(),
      currency: r.currency,
      burnTxHash: r.burnTxHash,
      payoutReference: r.payoutReference,
    };
  }

  async payoutStatus(redemptionId: string) {
    const r = await this.require(redemptionId);
    return {
      id: r.id,
      status: r.status,
      payoutReference: r.payoutReference,
      payoutSubmittedAt: r.payoutSubmittedAt?.toISOString() ?? null,
      payoutConfirmedAt: r.payoutConfirmedAt?.toISOString() ?? null,
    };
  }

  private async require(redemptionId: string) {
    const r = await this.prisma.redemption.findUnique({ where: { id: redemptionId } });
    if (!r) throw new NotFoundException(`Redemption ${redemptionId} not found`);
    return r;
  }
}
