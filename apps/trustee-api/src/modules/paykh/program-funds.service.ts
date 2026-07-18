import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { money, FundClassification, backingPolicyFor } from '@trustee/domain';
import { paykhProgramFundingEntry } from '@trustee/ledger';
import { PrismaService } from '../../infra/prisma.service';
import { AuditService } from '../../infra/audit.service';
import { EventsService, PaykhEvent } from '../../events/events.service';
import { ReserveLedgerService } from '../reserve/reserve-ledger.service';

export interface CreateProgramFund {
  tenantId: string;
  paykhProgramId: string;
  classification: FundClassification;
  currency: string;
  reserveAccountId: string;
  actor: string;
}

/**
 * PayKH program-fund safeguarding (update §11/§15). Cashback, gift-card float
 * and similar value-bearing liabilities are funded and safeguarded; reservations
 * cannot exceed cleared funding. Non-monetary promotional points need no fiat
 * backing (fund classification engine, update §16).
 */
@Injectable()
export class ProgramFundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly ledger: ReserveLedgerService,
  ) {}

  async create(input: CreateProgramFund) {
    const fund = await this.prisma.paykhProgramFund.create({
      data: {
        tenantId: input.tenantId,
        paykhProgramId: input.paykhProgramId,
        classification: input.classification,
        currency: input.currency,
        reserveAccountId: input.reserveAccountId,
      },
    });
    await this.audit.record({
      actor: input.actor,
      action: 'paykh.program_fund.created',
      subjectType: 'PAYKH_PROGRAM_FUND',
      subjectId: fund.id,
      afterState: { classification: input.classification },
    });
    return { id: fund.id, classification: fund.classification, status: fund.status };
  }

  /** Record cleared program funding and safeguard it in the ledger. */
  async fund(fundId: string, amountMinor: string, actor: string) {
    const fund = await this.require(fundId);
    const amount = money(BigInt(amountMinor), fund.currency);
    if (amount.minor <= 0n) throw new BadRequestException('Funding amount must be positive');

    const policy = backingPolicyFor(fund.classification as FundClassification);
    if (policy.fiatBackingRequired) {
      await this.ledger.post(
        paykhProgramFundingEntry(amount, {
          source: `paykh-fund:${fundId}`,
          programId: fund.tenantId,
          assetId: fund.paykhProgramId,
          actor,
        }),
      );
    }
    const updated = await this.prisma.paykhProgramFund.update({
      where: { id: fundId },
      data: { fundedMinor: fund.fundedMinor + amount.minor },
    });
    await this.events.publishToPaykh(PaykhEvent.PROGRAM_FUND_CLEARED, {
      fundId,
      fundedMinor: updated.fundedMinor.toString(),
    });
    return { id: fundId, fundedMinor: updated.fundedMinor.toString() };
  }

  /** Reserve part of the available balance for an issuance (e.g. cashback). */
  async reserve(fundId: string, amountMinor: string, actor: string) {
    const fund = await this.require(fundId);
    const amount = BigInt(amountMinor);
    const available = fund.fundedMinor - fund.reservedMinor;
    if (amount > available) {
      throw new BadRequestException('Insufficient available program funding to reserve');
    }
    const updated = await this.prisma.paykhProgramFund.update({
      where: { id: fundId },
      data: { reservedMinor: fund.reservedMinor + amount },
    });
    await this.audit.record({
      actor,
      action: 'paykh.program_fund.reserved',
      subjectType: 'PAYKH_PROGRAM_FUND',
      subjectId: fundId,
      afterState: { reservedMinor: updated.reservedMinor.toString() },
    });
    const remaining = updated.fundedMinor - updated.reservedMinor;
    if (remaining === 0n) {
      await this.events.publishToPaykh(PaykhEvent.PROGRAM_FUND_EXHAUSTED, { fundId });
    }
    return { id: fundId, reservedMinor: updated.reservedMinor.toString(), availableMinor: remaining.toString() };
  }

  async release(fundId: string, amountMinor: string, actor: string) {
    const fund = await this.require(fundId);
    const amount = BigInt(amountMinor);
    if (amount > fund.reservedMinor) {
      throw new BadRequestException('Cannot release more than reserved');
    }
    const updated = await this.prisma.paykhProgramFund.update({
      where: { id: fundId },
      data: { reservedMinor: fund.reservedMinor - amount },
    });
    await this.audit.record({
      actor,
      action: 'paykh.program_fund.released',
      subjectType: 'PAYKH_PROGRAM_FUND',
      subjectId: fundId,
    });
    return { id: fundId, reservedMinor: updated.reservedMinor.toString() };
  }

  async get(fundId: string) {
    const f = await this.require(fundId);
    return {
      id: f.id, tenantId: f.tenantId, paykhProgramId: f.paykhProgramId,
      classification: f.classification, currency: f.currency, status: f.status,
      fundedMinor: f.fundedMinor.toString(), reservedMinor: f.reservedMinor.toString(),
    };
  }

  async balance(fundId: string) {
    const fund = await this.require(fundId);
    const available = fund.fundedMinor - fund.reservedMinor;
    return {
      id: fund.id,
      classification: fund.classification,
      currency: fund.currency,
      fundedMinor: fund.fundedMinor.toString(),
      reservedMinor: fund.reservedMinor.toString(),
      availableMinor: available.toString(),
    };
  }

  private async require(fundId: string) {
    const f = await this.prisma.paykhProgramFund.findUnique({ where: { id: fundId } });
    if (!f) throw new NotFoundException(`Program fund ${fundId} not found`);
    return f;
  }
}
