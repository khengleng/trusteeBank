import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infra/prisma.service';
import { ClockService } from '../../infra/clock.service';
import { AuditService } from '../../infra/audit.service';
import { EventsService, PlatformEvent } from '../../events/events.service';

export interface CreateFundingInstruction {
  programId: string;
  paychainRequestId: string;
  assetId: string;
  depositor: string;
  expectedPayer?: string;
  beneficiaryAccountId: string;
  amountMinor: string;
  currency: string;
  permittedMethod: string;
  ttlSeconds?: number;
  actor: string;
}

/**
 * Funding instructions (§13). Before accepting funds for minting the platform
 * issues a unique reference and beneficiary details, with an expiry. Funding is
 * never marked complete here — only bank-side deposit clearance does that (§13,
 * §49).
 */
@Injectable()
export class FundingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  async create(input: CreateFundingInstruction) {
    const account = await this.prisma.trusteeAccount.findUnique({
      where: { id: input.beneficiaryAccountId },
    });
    if (!account) {
      throw new NotFoundException(`Beneficiary account ${input.beneficiaryAccountId} not found`);
    }
    const ttl = input.ttlSeconds ?? 3600;
    const expiresAt = new Date(this.clock.now().getTime() + ttl * 1000);
    const uniqueReference = `PC-${input.assetId}-${randomUUID().slice(0, 8).toUpperCase()}`;

    const created = await this.prisma.fundingInstruction.create({
      data: {
        programId: input.programId,
        paychainRequestId: input.paychainRequestId,
        assetId: input.assetId,
        depositor: input.depositor,
        expectedPayer: input.expectedPayer ?? null,
        beneficiaryAccountId: input.beneficiaryAccountId,
        amountMinor: BigInt(input.amountMinor),
        currency: input.currency,
        uniqueReference,
        permittedMethod: input.permittedMethod,
        expiresAt,
        status: 'ISSUED',
      },
    });

    await this.audit.record({
      actor: input.actor,
      action: 'funding_instruction.created',
      subjectType: 'FUNDING_INSTRUCTION',
      subjectId: created.id,
      afterState: { uniqueReference, amountMinor: input.amountMinor },
    });
    await this.events.publish(PlatformEvent.FUNDING_INSTRUCTION_CREATED, {
      fundingInstructionId: created.id,
      uniqueReference,
      programId: input.programId,
    });

    return {
      id: created.id,
      uniqueReference,
      beneficiaryBank: account.bankLegalEntity,
      beneficiaryAccountName: account.accountName,
      maskedAccountNumber: account.maskedAccountNumber,
      currency: created.currency,
      amountMinor: created.amountMinor.toString(),
      expiresAt: created.expiresAt.toISOString(),
      status: created.status,
    };
  }

  async get(id: string) {
    const fi = await this.prisma.fundingInstruction.findUnique({ where: { id } });
    if (!fi) throw new NotFoundException(`Funding instruction ${id} not found`);
    return {
      id: fi.id,
      status: fi.status,
      uniqueReference: fi.uniqueReference,
      amountMinor: fi.amountMinor.toString(),
      currency: fi.currency,
      expiresAt: fi.expiresAt.toISOString(),
    };
  }

  async status(id: string) {
    const fi = await this.prisma.fundingInstruction.findUnique({
      where: { id }, select: { id: true, status: true, expiresAt: true },
    });
    if (!fi) throw new NotFoundException(`Funding instruction ${id} not found`);
    return { id: fi.id, status: fi.status, expiresAt: fi.expiresAt.toISOString() };
  }

  /** Cancel an unfunded instruction (§27). Funded ones cannot be cancelled. */
  async cancel(id: string, actor: string) {
    const fi = await this.prisma.fundingInstruction.findUnique({ where: { id } });
    if (!fi) throw new NotFoundException(`Funding instruction ${id} not found`);
    if (fi.status === 'FUNDED') {
      throw new BadRequestException('A funded instruction cannot be cancelled');
    }
    await this.prisma.fundingInstruction.update({ where: { id }, data: { status: 'CANCELLED' } });
    await this.audit.record({ actor, action: 'funding_instruction.cancelled', subjectType: 'FUNDING_INSTRUCTION', subjectId: id });
    return { id, status: 'CANCELLED' };
  }
}
