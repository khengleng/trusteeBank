import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { money } from '@trustee/domain';
import { paykhPaymentCollectionEntry, reverse } from '@trustee/ledger';
import { PrismaService } from '../../infra/prisma.service';
import { ClockService } from '../../infra/clock.service';
import { AuditService } from '../../infra/audit.service';
import { EventsService, PaykhEvent } from '../../events/events.service';
import { ReserveLedgerService } from '../reserve/reserve-ledger.service';

export interface CreatePaymentOrder {
  tenantId: string;
  profileId: string;
  amountMinor: string;
  currency: string;
  ttlSeconds?: number;
  actor: string;
}

export interface CheckPaymentInput {
  bankTransactionId: string;
  amountMinor: string;
  currency: string;
  paymentReference: string;
  recipientAccountMasked: string;
  reserveAccountId: string;
  actor: string;
}

/**
 * PayKH payment orders and KHQR matching (update §13/§14). A per-order unique
 * reference is issued; a bank transaction is confirmed against amount, currency,
 * recipient and reference. One bank transaction can satisfy at most one order
 * (duplicate-payment prevention, update §13/§14/§20). Payments are never
 * confirmed from screenshots or frontend callbacks (update §14).
 */
@Injectable()
export class PaymentOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: ClockService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly ledger: ReserveLedgerService,
  ) {}

  async create(input: CreatePaymentOrder) {
    const profile = await this.prisma.paykhPaymentProfile.findUnique({
      where: { id: input.profileId },
    });
    if (!profile) throw new NotFoundException('Payment profile not found');
    if (profile.status !== 'ACTIVE') {
      throw new BadRequestException('Payment profile must be ACTIVE to accept orders');
    }
    if (profile.currency !== input.currency) {
      throw new BadRequestException('Order currency does not match profile currency');
    }

    const paymentReference = `KHQR-${randomUUID().slice(0, 12).toUpperCase()}`;
    const ttl = input.ttlSeconds ?? 900;
    const expiresAt = new Date(this.clock.now().getTime() + ttl * 1000);
    const order = await this.prisma.paykhPaymentOrder.create({
      data: {
        tenantId: input.tenantId,
        profileId: input.profileId,
        amountMinor: BigInt(input.amountMinor),
        currency: input.currency,
        paymentReference,
        khqrString: this.buildKhqr(profile.khqrPayload, input.amountMinor, paymentReference),
        status: 'AWAITING_PAYMENT',
        expiresAt,
      },
    });
    await this.audit.record({
      actor: input.actor,
      action: 'paykh.payment_order.created',
      subjectType: 'PAYKH_PAYMENT_ORDER',
      subjectId: order.id,
      afterState: { paymentReference, amountMinor: input.amountMinor },
    });
    return {
      id: order.id,
      status: order.status,
      paymentReference,
      khqrString: order.khqrString,
      expiresAt: order.expiresAt.toISOString(),
    };
  }

  /**
   * Confirm a bank transaction against an order. All of amount, currency,
   * recipient and reference must match. A bank transaction already applied to
   * another order is refused (duplicate prevention).
   */
  async checkPayment(orderId: string, input: CheckPaymentInput) {
    const order = await this.require(orderId);
    if (order.status === 'CONFIRMED') {
      // Idempotent success only if it is the same bank transaction.
      if (order.matchedBankTransactionId === input.bankTransactionId) {
        return { id: orderId, status: order.status, alreadyConfirmed: true };
      }
      throw new ConflictException('Order already confirmed by a different bank transaction');
    }
    if (order.status !== 'AWAITING_PAYMENT' && order.status !== 'PAYMENT_DETECTED') {
      throw new BadRequestException(`Order cannot be confirmed from ${order.status}`);
    }
    if (order.expiresAt.getTime() < this.clock.now().getTime()) {
      await this.prisma.paykhPaymentOrder.update({
        where: { id: orderId },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Payment order expired');
    }

    // Duplicate prevention: this bank transaction must not match another order.
    const priorUse = await this.prisma.paykhPaymentOrder.findUnique({
      where: { matchedBankTransactionId: input.bankTransactionId },
    });
    if (priorUse && priorUse.id !== orderId) {
      await this.events.publishToPaykh(PaykhEvent.PAYMENT_DUPLICATE, {
        orderId,
        bankTransactionId: input.bankTransactionId,
        conflictingOrderId: priorUse.id,
      });
      throw new ConflictException(
        'Bank transaction already applied to another payment order (duplicate)',
      );
    }

    const mismatches: string[] = [];
    if (BigInt(input.amountMinor) !== order.amountMinor) mismatches.push('amount');
    if (input.currency !== order.currency) mismatches.push('currency');
    if (input.paymentReference !== order.paymentReference) mismatches.push('reference');
    const profile = await this.prisma.paykhPaymentProfile.findUnique({
      where: { id: order.profileId },
    });
    if (profile && input.recipientAccountMasked !== profile.recipientAccountMasked) {
      mismatches.push('recipient');
    }
    if (mismatches.length > 0) {
      await this.events.publishToPaykh(PaykhEvent.PAYMENT_REJECTED, {
        orderId,
        mismatches,
      });
      throw new BadRequestException({ message: 'Payment does not match order', mismatches });
    }

    // Book the collected payment into the trustee ledger (update §21).
    await this.ledger.post(
      paykhPaymentCollectionEntry(money(order.amountMinor, order.currency), {
        source: `paykh-order:${orderId}`,
        programId: order.tenantId, // tenant acts as the program dimension for PayKH
        assetId: 'FIAT',
        actor: input.actor,
      }),
    );

    const updated = await this.prisma.paykhPaymentOrder.update({
      where: { id: orderId },
      data: {
        status: 'CONFIRMED',
        matchedBankTransactionId: input.bankTransactionId,
        confirmedAt: this.clock.now(),
      },
    });
    await this.audit.record({
      actor: input.actor,
      action: 'paykh.payment.confirmed',
      subjectType: 'PAYKH_PAYMENT_ORDER',
      subjectId: orderId,
      afterState: { status: updated.status, bankTransactionId: input.bankTransactionId },
    });
    await this.events.publishToPaykh(PaykhEvent.PAYMENT_CONFIRMED, {
      orderId,
      tenantId: order.tenantId,
      amountMinor: order.amountMinor.toString(),
      currency: order.currency,
      bankTransactionId: input.bankTransactionId,
    });
    return { id: orderId, status: updated.status };
  }

  /**
   * Refund a confirmed payment (update §13 refund). Reverses the collection in
   * the trustee ledger via a compensating entry (never edits) and emits a signed
   * `paykh.payment.refunded` event. Only CONFIRMED orders can be refunded.
   */
  async refund(orderId: string, actor: string, reason: string) {
    const order = await this.require(orderId);
    if (order.status !== 'CONFIRMED') {
      throw new BadRequestException(`Only CONFIRMED orders can be refunded, is ${order.status}`);
    }
    const collection = paykhPaymentCollectionEntry(money(order.amountMinor, order.currency), {
      source: `paykh-order:${orderId}`,
      programId: order.tenantId,
      assetId: 'FIAT',
      actor,
    });
    // Compensating (reversal) entry — swaps debit/credit, stays balanced.
    await this.ledger.post(
      reverse(collection, `paykh-refund:${orderId}`, actor, reason),
    );
    const updated = await this.prisma.paykhPaymentOrder.update({
      where: { id: orderId },
      data: { status: 'REFUNDED' },
    });
    await this.audit.record({
      actor,
      action: 'paykh.payment.refunded',
      subjectType: 'PAYKH_PAYMENT_ORDER',
      subjectId: orderId,
      reason,
    });
    await this.events.publishToPaykh(PaykhEvent.PAYMENT_REFUNDED, {
      orderId,
      tenantId: order.tenantId,
      amountMinor: order.amountMinor.toString(),
    });
    return { id: orderId, status: updated.status };
  }

  async get(orderId: string) {
    const o = await this.require(orderId);
    return {
      id: o.id,
      status: o.status,
      paymentReference: o.paymentReference,
      amountMinor: o.amountMinor.toString(),
      currency: o.currency,
      matchedBankTransactionId: o.matchedBankTransactionId,
    };
  }

  async status(orderId: string) {
    const o = await this.require(orderId);
    return { id: o.id, status: o.status, expiresAt: o.expiresAt.toISOString() };
  }

  /** Cancel an unpaid order (§13). Confirmed orders cannot be cancelled. */
  async cancel(orderId: string, actor: string) {
    const o = await this.require(orderId);
    if (o.status === 'CONFIRMED') {
      throw new BadRequestException('A confirmed order cannot be cancelled (use refund)');
    }
    const updated = await this.prisma.paykhPaymentOrder.update({
      where: { id: orderId }, data: { status: 'CANCELLED' },
    });
    await this.audit.record({ actor, action: 'paykh.payment_order.cancelled', subjectType: 'PAYKH_PAYMENT_ORDER', subjectId: orderId });
    return { id: orderId, status: updated.status };
  }

  /**
   * Build a KHQR string for the order. A production deployment delegates to an
   * approved KHQR/Bakong service; here we derive a deterministic pilot payload
   * embedding the amount and unique reference.
   */
  private buildKhqr(basePayload: string, amountMinor: string, reference: string): string {
    return `${basePayload}|amt=${amountMinor}|ref=${reference}`;
  }

  private async require(orderId: string) {
    const o = await this.prisma.paykhPaymentOrder.findUnique({ where: { id: orderId } });
    if (!o) throw new NotFoundException(`Payment order ${orderId} not found`);
    return o;
  }
}
