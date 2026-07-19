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

class RegisterBankDto {
  @IsString() @IsNotEmpty() bankId!: string;
  @IsString() @IsNotEmpty() bankLegalName!: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() integrationMode?: string; // MOCK | API | MANUAL | STATEMENT
  @IsOptional() @IsString() baseUrl?: string;
  @IsOptional() @IsString() authTokenEnv?: string;
  @IsString() @IsNotEmpty() actor!: string;
}

class SetAccountBankDto {
  @IsOptional() @IsString() bankId?: string;
  @IsOptional() @IsNumberString() mockClearedMinor?: string;
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
  @ApiOperation({ summary: 'Reconcile reserve ledger cash against the banks (multi-bank, §26)' })
  bankReconcile(@Param('programId') programId: string) {
    return this.reserve.reconcileBank(programId);
  }

  // --- Multi-bank registry (§26) ---
  @Post('bank-connections')
  @ApiOperation({ summary: 'Register/update a bank connection (mock/api/manual, §26)' })
  registerBank(@Body() dto: RegisterBankDto) {
    return this.reserve.registerBank(dto);
  }

  @Get('bank-connections')
  @ApiOperation({ summary: 'List bank connections' })
  listBanks() {
    return this.reserve.listBanks();
  }

  @Post('reserve-accounts/:id/bank')
  @ApiOperation({ summary: 'Link an account to a bank / set its mock cleared balance (§26)' })
  setAccountBank(@Param('id') id: string, @Body() dto: SetAccountBankDto) {
    return this.reserve.setAccountBank(id, dto);
  }
}
