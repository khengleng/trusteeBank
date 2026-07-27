import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReconciliationService } from './reconciliation.service';

class ProgramReconDto {
  @IsString() @IsNotEmpty() programId!: string;
  @IsString() @IsNotEmpty() actor!: string;
}
class TenantReconDto {
  @IsString() @IsNotEmpty() tenantId!: string;
  @IsString() @IsNotEmpty() actor!: string;
}
/** Closing an exception un-blocks minting, so it demands an actor and a reason. */
class ResolveExceptionDto {
  @IsString() @IsNotEmpty() actor!: string;
  @IsString() @IsNotEmpty() reason!: string;
}

/** PayChain reconciliation (§24). */
@ApiTags('paychain-reconciliation')
@Controller('api/v1/paychain')
export class PaychainReconciliationController {
  constructor(private readonly recon: ReconciliationService) {}

  @Post('reconciliations')
  @ApiOperation({ summary: 'Run a reserve reconciliation (§24 level 5)' })
  run(@Body() dto: ProgramReconDto) {
    return this.recon.reconcileReserve(dto.programId, dto.actor);
  }

  @Get('reconciliations/:id')
  @ApiOperation({ summary: 'Get a reconciliation run + exceptions' })
  get(@Param('id') id: string) {
    return this.recon.get(id);
  }

  @Get('reconciliation-exceptions')
  @ApiOperation({ summary: 'List open reconciliation exceptions' })
  exceptions(@Query('resolved') resolved?: string) {
    return this.recon.listExceptions(resolved === 'true');
  }

  @Post('reconciliation-exceptions/:id/resolve')
  @ApiOperation({ summary: 'Resolve an exception (un-blocks minting, §17/§24)' })
  resolve(@Param('id') id: string, @Body() dto: ResolveExceptionDto) {
    return this.recon.resolveException(id, dto.actor, dto.reason);
  }
}

/** PayKH reconciliation (update §22). */
@ApiTags('paykh-reconciliation')
@Controller('api/v1/paykh')
export class PaykhReconciliationController {
  constructor(private readonly recon: ReconciliationService) {}

  @Post('reconciliations/payment-orders')
  @ApiOperation({ summary: 'Reconcile PayKH payment orders vs bank txns (§22)' })
  orders(@Body() dto: TenantReconDto) {
    return this.recon.reconcilePaymentOrders(dto.tenantId, dto.actor);
  }

  @Post('reconciliations/merchant-settlements')
  @ApiOperation({ summary: 'Reconcile PayKH merchant settlements (§22)' })
  settlements(@Body() dto: TenantReconDto) {
    return this.recon.reconcileSettlements(dto.tenantId, dto.actor);
  }

  @Get('reconciliation-exceptions')
  @ApiOperation({ summary: 'List open PayKH reconciliation exceptions' })
  exceptions(@Query('resolved') resolved?: string) {
    return this.recon.listExceptions(resolved === 'true');
  }

  @Post('reconciliation-exceptions/:id/resolve')
  @ApiOperation({ summary: 'Resolve a PayKH reconciliation exception (§24)' })
  resolve(@Param('id') id: string, @Body() dto: ResolveExceptionDto) {
    return this.recon.resolveException(id, dto.actor, dto.reason);
  }
}
