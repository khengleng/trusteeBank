import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { money, zero, DepositStatus, MINT_ELIGIBLE_DEPOSIT_STATUSES } from '@trustee/domain';
import { LedgerAccountCode, buildJournalEntry } from '@trustee/ledger';
import { PrismaService } from '../../infra/prisma.service';
import { ClockService } from '../../infra/clock.service';
import { AuditService } from '../../infra/audit.service';
import { EventsService, PlatformEvent } from '../../events/events.service';
import { ReserveLedgerService } from '../reserve/reserve-ledger.service';

export interface RegisterDeposit {
  programId: string;
  trusteeAccountId: string;
  bankTransactionId: string;
  amountMinor: string;
  currency: string;
  payerName?: string;
  paymentReference?: string;
  transactionDate: string;
  actor: string;
}

/**
 * Deposit detection, matching and clearance (§12). A detected deposit is booked
 * as unmatched (§14). Minting is never permitted against pending, unmatched,
 * held or returned deposits (§12, §49) — only clearance moves funds into the
 * reserve obligation and makes them mint-eligible.
 */
@Injectable()
export class DepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly ledger: ReserveLedgerService,
  ) {}

  /** Register a bank-detected deposit and book it as unmatched cash (§14). */
  async register(input: RegisterDeposit) {
    const account = await this.prisma.trusteeAccount.findUnique({
      where: { id: input.trusteeAccountId },
    });
    if (!account) throw new NotFoundException('Trustee account not found');

    const amount = money(BigInt(input.amountMinor), input.currency);
    const deposit = await this.prisma.deposit.create({
      data: {
        programId: input.programId,
        trusteeAccountId: input.trusteeAccountId,
        bankTransactionId: input.bankTransactionId,
        amountMinor: amount.minor,
        currency: input.currency,
        payerName: input.payerName ?? null,
        paymentReference: input.paymentReference ?? null,
        transactionDate: new Date(input.transactionDate),
        status: DepositStatus.DETECTED,
      },
    });

    // Cash arrived but is not yet matched: debit cash, credit unmatched liability.
    await this.ledger.post(
      buildJournalEntry({
        currency: input.currency,
        description: 'Detected deposit booked as unmatched',
        postings: [
          { account: LedgerAccountCode.ASSET_TRUSTEE_BANK_CASH, debit: amount, credit: zero(input.currency) },
          { account: LedgerAccountCode.LIABILITY_UNMATCHED_DEPOSIT, debit: zero(input.currency), credit: amount },
        ],
        references: {
          source: `deposit:${deposit.id}`,
          programId: input.programId,
          assetId: account.supportedAssetId,
          actor: input.actor,
        },
      }),
    );

    await this.audit.record({
      actor: input.actor,
      action: 'deposit.detected',
      subjectType: 'DEPOSIT',
      subjectId: deposit.id,
      afterState: { status: deposit.status, amountMinor: input.amountMinor },
    });
    await this.events.publish(PlatformEvent.DEPOSIT_DETECTED, {
      depositId: deposit.id,
      programId: input.programId,
    });
    return { id: deposit.id, status: deposit.status };
  }

  /** Match a detected deposit to a funding instruction (§12). */
  async match(depositId: string, fundingInstructionId: string, actor: string) {
    const deposit = await this.requireDeposit(depositId);
    if (deposit.status !== DepositStatus.DETECTED && deposit.status !== DepositStatus.UNMATCHED) {
      throw new BadRequestException(`Deposit ${depositId} cannot be matched from ${deposit.status}`);
    }
    const fi = await this.prisma.fundingInstruction.findUnique({
      where: { id: fundingInstructionId },
    });
    if (!fi) throw new NotFoundException('Funding instruction not found');
    if (fi.currency !== deposit.currency) {
      throw new BadRequestException('Currency mismatch between deposit and funding instruction');
    }
    if (fi.amountMinor !== deposit.amountMinor) {
      throw new BadRequestException('Amount mismatch between deposit and funding instruction');
    }

    const updated = await this.prisma.deposit.update({
      where: { id: depositId },
      data: { fundingInstructionId, status: DepositStatus.MATCHED },
    });
    await this.audit.record({
      actor,
      action: 'deposit.matched',
      subjectType: 'DEPOSIT',
      subjectId: depositId,
      beforeState: { status: deposit.status },
      afterState: { status: updated.status, fundingInstructionId },
    });
    await this.events.publish(PlatformEvent.DEPOSIT_MATCHED, { depositId, fundingInstructionId });
    return { id: depositId, status: updated.status };
  }

  /**
   * Confirm cleared funds (§12). Reclassifies the matched deposit from the
   * unmatched liability into the PayChain reserve obligation, making it eligible
   * to back minting.
   */
  async clear(depositId: string, actor: string) {
    const deposit = await this.requireDeposit(depositId);
    if (deposit.status !== DepositStatus.MATCHED) {
      throw new BadRequestException(
        `Deposit ${depositId} must be MATCHED before clearance, is ${deposit.status}`,
      );
    }
    const account = await this.prisma.trusteeAccount.findUnique({
      where: { id: deposit.trusteeAccountId },
    });
    if (!account) throw new NotFoundException('Trustee account not found');

    const amount = money(deposit.amountMinor, deposit.currency);
    await this.ledger.post(
      buildJournalEntry({
        currency: deposit.currency,
        description: 'Cleared deposit reclassified to reserve obligation',
        postings: [
          { account: LedgerAccountCode.LIABILITY_UNMATCHED_DEPOSIT, debit: amount, credit: zero(deposit.currency) },
          { account: LedgerAccountCode.LIABILITY_PAYCHAIN_RESERVE_OBLIGATION, debit: zero(deposit.currency), credit: amount },
        ],
        references: {
          source: `deposit-clear:${deposit.id}`,
          programId: deposit.programId,
          assetId: account.supportedAssetId,
          actor,
        },
      }),
    );

    const updated = await this.prisma.deposit.update({
      where: { id: depositId },
      data: { status: DepositStatus.CLEARED, clearedAt: this.clock.now() },
    });
    await this.audit.record({
      actor,
      action: 'deposit.cleared',
      subjectType: 'DEPOSIT',
      subjectId: depositId,
      beforeState: { status: deposit.status },
      afterState: { status: updated.status },
    });
    await this.events.publish(PlatformEvent.DEPOSIT_CLEARED, { depositId });
    return { id: depositId, status: updated.status };
  }

  async get(depositId: string) {
    const d = await this.requireDeposit(depositId);
    return {
      id: d.id,
      status: d.status,
      amountMinor: d.amountMinor.toString(),
      currency: d.currency,
      mintEligible: MINT_ELIGIBLE_DEPOSIT_STATUSES.includes(d.status as DepositStatus),
    };
  }

  private async requireDeposit(depositId: string) {
    const d = await this.prisma.deposit.findUnique({ where: { id: depositId } });
    if (!d) throw new NotFoundException(`Deposit ${depositId} not found`);
    return d;
  }
}
