import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { money } from '@trustee/domain';
import { paykhMerchantSettlementEntry } from '@trustee/ledger';
import { PrismaService } from '../../infra/prisma.service';
import { ClockService } from '../../infra/clock.service';
import { AuditService } from '../../infra/audit.service';
import { EventsService, PaykhEvent } from '../../events/events.service';
import { ReserveLedgerService } from '../reserve/reserve-ledger.service';
import { MerchantsService } from './merchants.service';

export interface CreateSettlement {
  tenantId: string;
  merchantId: string;
  amountMinor: string;
  currency: string;
  actor: string;
}

/**
 * PayKH merchant settlement (update §13). Settlement requires maker-checker:
 * the requester cannot approve their own settlement (§9). Confirmation discharges
 * the merchant payable in the trustee ledger (update §21).
 */
@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly ledger: ReserveLedgerService,
    private readonly merchants: MerchantsService,
  ) {}

  async create(input: CreateSettlement) {
    // Referential integrity: settle only to an onboarded, ACTIVE merchant (§25).
    await this.merchants.requireActive(input.merchantId);
    const settlement = await this.prisma.paykhSettlement.create({
      data: {
        tenantId: input.tenantId,
        merchantId: input.merchantId,
        amountMinor: BigInt(input.amountMinor),
        currency: input.currency,
        status: 'REQUESTED',
      },
    });
    await this.audit.record({
      actor: input.actor,
      action: 'paykh.settlement.requested',
      subjectType: 'PAYKH_SETTLEMENT',
      subjectId: settlement.id,
    });
    // The requester is recorded as maker via audit; store for SoD check.
    await this.prisma.auditLog.create({
      data: {
        actor: input.actor,
        action: 'paykh.settlement.maker',
        subjectType: 'PAYKH_SETTLEMENT',
        subjectId: settlement.id,
      },
    });
    return { id: settlement.id, status: settlement.status };
  }

  async approve(settlementId: string, checkerId: string) {
    const settlement = await this.require(settlementId);
    if (settlement.status !== 'REQUESTED') {
      throw new BadRequestException(`Settlement cannot be approved from ${settlement.status}`);
    }
    // Segregation of duties: approver must differ from requester (§9).
    const makerLog = await this.prisma.auditLog.findFirst({
      where: { subjectId: settlementId, action: 'paykh.settlement.maker' },
      orderBy: { createdAt: 'asc' },
    });
    if (makerLog && makerLog.actor === checkerId) {
      throw new ForbiddenException('A user cannot approve their own settlement (§9)');
    }
    const updated = await this.prisma.paykhSettlement.update({
      where: { id: settlementId },
      data: { status: 'APPROVED', approvedById: checkerId },
    });
    await this.audit.record({
      actor: checkerId,
      action: 'paykh.settlement.approved',
      subjectType: 'PAYKH_SETTLEMENT',
      subjectId: settlementId,
    });
    await this.events.publishToPaykh(PaykhEvent.SETTLEMENT_APPROVED, { settlementId });
    return { id: settlementId, status: updated.status };
  }

  /** Confirm bank-side settlement and discharge the merchant payable. */
  async confirm(settlementId: string, actor: string) {
    const settlement = await this.require(settlementId);
    if (settlement.status !== 'APPROVED' && settlement.status !== 'SUBMITTED') {
      throw new BadRequestException(`Settlement must be APPROVED/SUBMITTED to confirm, is ${settlement.status}`);
    }
    await this.ledger.post(
      paykhMerchantSettlementEntry(money(settlement.amountMinor, settlement.currency), {
        source: `paykh-settlement:${settlementId}`,
        programId: settlement.tenantId,
        assetId: 'FIAT',
        actor,
      }),
    );
    const updated = await this.prisma.paykhSettlement.update({
      where: { id: settlementId },
      data: { status: 'CONFIRMED', confirmedAt: this.clock.now() },
    });
    await this.events.publishToPaykh(PaykhEvent.SETTLEMENT_CONFIRMED, { settlementId });
    return { id: settlementId, status: updated.status };
  }

  async get(settlementId: string) {
    const s = await this.require(settlementId);
    return {
      id: s.id,
      status: s.status,
      amountMinor: s.amountMinor.toString(),
      currency: s.currency,
    };
  }

  /** Cancel a settlement before confirmation (§13). */
  async cancel(settlementId: string, actor: string) {
    const s = await this.require(settlementId);
    if (s.status === 'CONFIRMED') {
      throw new BadRequestException('A confirmed settlement cannot be cancelled');
    }
    const updated = await this.prisma.paykhSettlement.update({
      where: { id: settlementId }, data: { status: 'CANCELLED' },
    });
    await this.audit.record({ actor, action: 'paykh.settlement.cancelled', subjectType: 'PAYKH_SETTLEMENT', subjectId: settlementId });
    return { id: settlementId, status: updated.status };
  }

  private async require(settlementId: string) {
    const s = await this.prisma.paykhSettlement.findUnique({ where: { id: settlementId } });
    if (!s) throw new NotFoundException(`Settlement ${settlementId} not found`);
    return s;
  }
}
