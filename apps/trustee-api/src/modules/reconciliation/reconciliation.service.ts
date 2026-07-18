import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@trustee/database';
import { PrismaService } from '../../infra/prisma.service';
import { EventsService, PlatformEvent } from '../../events/events.service';
import { ReserveService } from '../reserve/reserve.service';

/**
 * Multi-level reconciliation (§24, update §22). Compares the trustee's own
 * records across systems and records exceptions; it never silently overwrites a
 * mismatch (§24/§49). Pilot scope covers reserve reconciliation (PayChain) and
 * payment-order / merchant-settlement reconciliation (PayKH).
 */
@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reserve: ReserveService,
    private readonly events: EventsService,
  ) {}

  /** PayChain reserve reconciliation: eligible reserve vs circulating liability. */
  async reconcileReserve(programId: string, actor: string) {
    const pos = await this.reserve.position(programId);
    const exceptions: Array<{ type: string; detail: Record<string, unknown> }> = [];

    if (pos.surplus.minor < 0n) {
      exceptions.push({
        type: 'RESERVE_SHORTFALL',
        detail: {
          eligibleReserveMinor: pos.eligibleReserve.minor.toString(),
          requiredReserveMinor: pos.requiredReserve.minor.toString(),
          shortfallMinor: pos.surplus.minor.toString(),
        },
      });
    }
    if (pos.liabilityAgeSeconds === null) {
      exceptions.push({ type: 'MISSING_LIABILITY_FEED', detail: { programId } });
    }

    const run = await this.record('RESERVE', { programId }, {
      eligibleReserveMinor: pos.eligibleReserve.minor.toString(),
      reserveObligationMinor: pos.reserveObligation.minor.toString(),
      reserveRatioBps: pos.reserveRatioBps,
    }, exceptions, actor);

    if (exceptions.length > 0) {
      await this.events.publish(PlatformEvent.RECONCILIATION_EXCEPTION_CREATED, {
        runId: run.id, programId, types: exceptions.map((e) => e.type),
      });
    }
    return run;
  }

  /** PayKH payment-order reconciliation: detect anomalous order states. */
  async reconcilePaymentOrders(tenantId: string, actor: string) {
    const orders = await this.prisma.paykhPaymentOrder.findMany({ where: { tenantId } });
    const exceptions: Array<{ type: string; detail: Record<string, unknown> }> = [];
    for (const o of orders) {
      if (o.status === 'CONFIRMED' && !o.matchedBankTransactionId) {
        exceptions.push({ type: 'CONFIRMED_WITHOUT_BANK_TXN', detail: { orderId: o.id } });
      }
    }
    // Duplicate bank-transaction usage across orders (belt-and-braces).
    const byTxn = new Map<string, string[]>();
    for (const o of orders) {
      if (o.matchedBankTransactionId) {
        const list = byTxn.get(o.matchedBankTransactionId) ?? [];
        list.push(o.id);
        byTxn.set(o.matchedBankTransactionId, list);
      }
    }
    for (const [txn, ids] of byTxn) {
      if (ids.length > 1) exceptions.push({ type: 'DUPLICATE_BANK_TXN', detail: { bankTransactionId: txn, orderIds: ids } });
    }
    const run = await this.record('PAYMENT_ORDERS', { tenantId }, { orderCount: orders.length }, exceptions, actor);
    return run;
  }

  /** PayKH merchant-settlement reconciliation. */
  async reconcileSettlements(tenantId: string, actor: string) {
    const settlements = await this.prisma.paykhSettlement.findMany({ where: { tenantId } });
    const exceptions: Array<{ type: string; detail: Record<string, unknown> }> = [];
    for (const s of settlements) {
      if (s.status === 'CONFIRMED' && !s.confirmedAt) {
        exceptions.push({ type: 'CONFIRMED_WITHOUT_TIMESTAMP', detail: { settlementId: s.id } });
      }
    }
    return this.record('MERCHANT_SETTLEMENTS', { tenantId }, { settlementCount: settlements.length }, exceptions, actor);
  }

  async get(runId: string) {
    const run = await this.prisma.reconciliationRun.findUnique({
      where: { id: runId },
      include: { exceptions: true },
    });
    if (!run) throw new NotFoundException(`Reconciliation run ${runId} not found`);
    return run;
  }

  async listExceptions(resolved = false) {
    const exceptions = await this.prisma.reconciliationException.findMany({
      where: { resolved },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return { exceptions };
  }

  private async record(
    scope: string,
    keys: { programId?: string; tenantId?: string },
    summary: Record<string, unknown>,
    exceptions: Array<{ type: string; detail: Record<string, unknown> }>,
    actor: string,
  ) {
    return this.prisma.reconciliationRun.create({
      data: {
        scope,
        programId: keys.programId ?? null,
        tenantId: keys.tenantId ?? null,
        status: exceptions.length ? 'EXCEPTIONS' : 'OK',
        summary: summary as Prisma.InputJsonValue,
        createdBy: actor,
        exceptions: {
          create: exceptions.map((e) => ({ type: e.type, detail: e.detail as Prisma.InputJsonValue })),
        },
      },
      include: { exceptions: true },
    });
  }
}
