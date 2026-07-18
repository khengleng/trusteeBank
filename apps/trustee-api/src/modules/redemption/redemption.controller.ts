import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
} from 'class-validator';
import { RedemptionService } from './redemption.service';
import { IdempotencyService } from '../../infra/idempotency.service';

class RequestRedemptionDto {
  @IsString() @IsNotEmpty() programId!: string;
  @IsString() @IsNotEmpty() paychainRedemptionId!: string;
  @IsNumberString() amountMinor!: string;
  @IsString() @IsNotEmpty() beneficiaryName!: string;
  @IsString() @IsNotEmpty() beneficiaryAccountMasked!: string;
  @IsOptional() @IsString() correlationId?: string;
}
class ConfirmBurnDto {
  @IsString() @IsNotEmpty() burnTxHash!: string;
  @IsString() @IsNotEmpty() actor!: string;
}
class ActorReasonDto {
  @IsString() @IsNotEmpty() actor!: string;
  @IsOptional() @IsString() reason?: string;
}
class ApproveRedemptionDto {
  @IsString() @IsNotEmpty() approverId!: string;
  @IsString() @IsNotEmpty() reason!: string;
}

/** PayChain-facing redemption routes (§20). */
@ApiTags('paychain-redemption')
@Controller('api/v1/paychain')
export class RedemptionController {
  constructor(
    private readonly redemption: RedemptionService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('redemptions')
  @ApiOperation({ summary: 'PayChain requests a redemption (§20)' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async request(@Body() dto: RequestRedemptionDto, @Headers('idempotency-key') key?: string) {
    const r = await this.idempotency.run(key, 'POST /redemptions', dto, () =>
      this.redemption.request(dto),
    );
    return r.value;
  }

  @Get('redemptions/:id')
  @ApiOperation({ summary: 'Get a redemption' })
  get(@Param('id') id: string) {
    return this.redemption.get(id);
  }

  @Post('redemptions/:id/confirm-burn')
  @ApiOperation({ summary: 'PayChain confirms the asset burn (§20)' })
  confirmBurn(@Param('id') id: string, @Body() dto: ConfirmBurnDto) {
    return this.redemption.confirmBurn(id, dto.burnTxHash, dto.actor);
  }

  @Get('redemptions/:id/payout')
  @ApiOperation({ summary: 'Payout status for a redemption' })
  payout(@Param('id') id: string) {
    return this.redemption.payoutStatus(id);
  }
}

/** Trustee-bank-only redemption approval & payout (§20/§21). */
@ApiTags('trustee-redemption')
@Controller('api/v1/bank')
export class TrusteeRedemptionController {
  constructor(private readonly redemption: RedemptionService) {}

  @Post('redemptions/:id/approve')
  @ApiOperation({ summary: 'Trustee approves a redemption (§20)' })
  approve(@Param('id') id: string, @Body() dto: ApproveRedemptionDto) {
    return this.redemption.approve(id, dto.approverId, dto.reason);
  }

  @Post('redemptions/:id/submit-payout')
  @ApiOperation({ summary: 'Trustee submits the fiat payout — only after burn (§21)' })
  submitPayout(@Param('id') id: string, @Body() dto: ActorReasonDto) {
    return this.redemption.submitPayout(id, dto.actor);
  }

  @Post('redemptions/:id/confirm-payout')
  @ApiOperation({ summary: 'Bank confirms settlement; complete the redemption (§20)' })
  confirmPayout(@Param('id') id: string, @Body() dto: ActorReasonDto) {
    return this.redemption.confirmPayout(id, dto.actor);
  }
}
