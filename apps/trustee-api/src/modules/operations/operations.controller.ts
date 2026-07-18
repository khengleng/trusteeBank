import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OperationsService } from './operations.service';
import { SettlementsService } from '../paykh/settlements.service';
import { ReserveService } from '../reserve/reserve.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';
import { RequirePermission } from '../../common/permission.guard';
import { Permission } from '@trustee/domain';

class ActorDto {
  @IsString() @IsNotEmpty() actor!: string;
}
class ApproveSettlementDto {
  @IsString() @IsNotEmpty() checkerId!: string;
}

/**
 * Trustee operational workbench read/action endpoints (§31 portals). Mounted
 * under /api/v1/admin so the admin console (TRUSTEE_BANK user session) can drive
 * daily operations: work queues, ledger/trial-balance, reports, reconciliation,
 * audit and settlement actions. Governance/action safety still flows through the
 * same guards, maker-checker and audit trail.
 */
@ApiTags('operations')
@Controller('api/v1/admin')
export class OperationsController {
  constructor(
    private readonly ops: OperationsService,
    private readonly settlements: SettlementsService,
    private readonly reserve: ReserveService,
    private readonly recon: ReconciliationService,
  ) {}

  @Get('ops/programs')
  programs() { return this.ops.programs(); }

  @Get('ops/queues')
  @ApiOperation({ summary: 'Actionable work queues (mint/redemption/deposit/settlement)' })
  queues() { return this.ops.queues(); }

  @Get('ledger/:programId/trial-balance')
  @ApiOperation({ summary: 'Trial balance per ledger account (§14)' })
  trialBalance(@Param('programId') programId: string) { return this.ops.trialBalance(programId); }

  @Get('ledger/:programId/entries')
  @ApiOperation({ summary: 'Recent journal entries (§14)' })
  entries(@Param('programId') programId: string, @Query('limit') limit?: string) {
    return this.ops.ledgerEntries(programId, limit ? Number(limit) : 50);
  }

  @Get('audit')
  @ApiOperation({ summary: 'Audit-log viewer (§34)' })
  audit(@Query('subjectType') subjectType?: string, @Query('action') action?: string, @Query('actor') actor?: string, @Query('limit') limit?: string) {
    return this.ops.auditLogs({ subjectType, action, actor, limit: limit ? Number(limit) : 100 });
  }

  @Get('reports/reserve/:programId')
  @ApiOperation({ summary: 'Daily reserve report (§35)' })
  reserveReport(@Param('programId') programId: string) { return this.ops.reserveReport(programId); }

  @Get('reports/liability/:programId')
  @ApiOperation({ summary: 'Liability report (§35)' })
  liabilityReport(@Param('programId') programId: string) { return this.ops.liabilityReport(programId); }

  @Get('reconciliations')
  @ApiOperation({ summary: 'Recent reconciliation runs (§24)' })
  reconciliations() { return this.ops.reconciliationRuns(); }

  @Get('attestations')
  @ApiOperation({ summary: 'Attestations list (§23)' })
  attestations() { return this.ops.attestations(); }

  @Post('proof-of-reserve/:programId/snapshots')
  @RequirePermission(Permission.POR_GENERATE)
  @ApiOperation({ summary: 'Generate a signed reserve snapshot (§22)' })
  generateSnapshot(@Param('programId') programId: string) {
    return this.reserve.createSnapshot(programId);
  }

  @Post('reconciliations/reserve')
  @ApiOperation({ summary: 'Run a reserve reconciliation (§24)' })
  reconReserve(@Body() b: { programId: string; actor: string }) {
    return this.recon.reconcileReserve(b.programId, b.actor);
  }

  @Post('reconciliations/payment-orders')
  @ApiOperation({ summary: 'Run a PayKH payment-order reconciliation (§22)' })
  reconOrders(@Body() b: { tenantId: string; actor: string }) {
    return this.recon.reconcilePaymentOrders(b.tenantId, b.actor);
  }

  // Settlement actions surfaced for trustee operators (mirror the PayKH routes).
  @Post('settlements/:id/approve')
  @RequirePermission(Permission.PAYKH_SETTLEMENT_APPROVE)
  approveSettlement(@Param('id') id: string, @Body() dto: ApproveSettlementDto) {
    return this.settlements.approve(id, dto.checkerId);
  }

  @Post('settlements/:id/confirm')
  @RequirePermission(Permission.PAYKH_SETTLEMENT_APPROVE)
  confirmSettlement(@Param('id') id: string, @Body() dto: ActorDto) {
    return this.settlements.confirm(id, dto.actor);
  }
}
