import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@trustee/database';
import { PrismaService } from '../../infra/prisma.service';
import { AuditService } from '../../infra/audit.service';
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
    private readonly audit: AuditService,
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

  /**
   * Close an exception after an operator has investigated it. An OPEN exception
   * blocks minting (§17 RECONCILIATION_UNRESOLVED), so resolving is a
   * value-affecting act: it demands an actor and a reason, and is audited.
   * Resolving never alters the underlying figures — a genuine mismatch is
   * corrected by a compensating entry, never by editing history (§14/§49).
   */
  async resolveException(id: string, actor: string, reason: string) {
    const existing = await this.prisma.reconciliationException.findUnique({
      where: { id },
      include: { run: { select: { scope: true, programId: true, tenantId: true } } },
    });
    if (!existing) throw new NotFoundException(`Reconciliation exception ${id} not found`);
    if (existing.resolved) {
      throw new BadRequestException(`Reconciliation exception ${id} is already resolved`);
    }

    const updated = await this.prisma.reconciliationException.update({
      where: { id },
      data: { resolved: true },
    });
    // The parent run no longer carries open exceptions — reflect that in its status.
    const stillOpen = await this.prisma.reconciliationException.count({
      where: { runId: existing.runId, resolved: false },
    });
    if (stillOpen === 0) {
      await this.prisma.reconciliationRun.update({
        where: { id: existing.runId },
        data: { status: 'OK' },
      });
    }

    await this.audit.record({
      actor,
      action: 'reconciliation.exception.resolved',
      subjectType: 'ReconciliationException',
      subjectId: id,
      beforeState: { resolved: false, type: existing.type, detail: existing.detail },
      afterState: { resolved: true, runId: existing.runId, scope: existing.run.scope },
      reason,
    });
    await this.events.publish(PlatformEvent.RECONCILIATION_EXCEPTION_RESOLVED, {
      exceptionId: id,
      runId: existing.runId,
      programId: existing.run.programId,
      tenantId: existing.run.tenantId,
      type: existing.type,
      resolvedBy: actor,
      reason,
    });
    return { id: updated.id, type: updated.type, resolved: updated.resolved, runId: updated.runId };
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
