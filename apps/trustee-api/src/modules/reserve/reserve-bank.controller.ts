import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';
import { ReserveService } from './reserve.service';

class AddAdjustmentDto {
  @IsString() @IsNotEmpty() kind!: string; // RESTRICTED | REGULATORY_HOLD | OPERATIONAL | BANK_CHARGE
  @IsNumberString() amountMinor!: string;
  @IsOptional() @IsString() reason?: string;
  @IsString() @IsNotEmpty() actor!: string;
}

class ActorBodyDto {
  @IsString() @IsNotEmpty() actor!: string;
}

/**
 * Trustee-bank reserve operations (§16/§26): eligible-reserve adjustments and
 * bank-vs-ledger reconciliation. Mounted under /api/v1/bank so only trustee-bank
 * credentials may reach it (client separation).
 */
@ApiTags('bank')
@Controller('api/v1/bank')
export class ReserveBankController {
  constructor(private readonly reserve: ReserveService) {}

  @Post('reserves/:programId/adjustments')
  @ApiOperation({ summary: 'Add an eligible-reserve adjustment (hold/restriction, §16)' })
  addAdjustment(@Param('programId') programId: string, @Body() dto: AddAdjustmentDto) {
    return this.reserve.addAdjustment({ programId, ...dto });
  }

  @Get('reserves/:programId/adjustments')
  @ApiOperation({ summary: 'List active reserve adjustments' })
  listAdjustments(@Param('programId') programId: string) {
    return this.reserve.listAdjustments(programId);
  }

  @Post('reserve-adjustments/:id/lift')
  @ApiOperation({ summary: 'Lift (deactivate) a reserve adjustment' })
  liftAdjustment(@Param('id') id: string, @Body() dto: ActorBodyDto) {
    return this.reserve.liftAdjustment(id, dto.actor);
  }

  @Post('reserves/:programId/bank-reconcile')
  @ApiOperation({ summary: 'Reconcile reserve ledger cash against the bank balance (§26)' })
  bankReconcile(@Param('programId') programId: string) {
    return this.reserve.reconcileBank(programId);
  }
}
