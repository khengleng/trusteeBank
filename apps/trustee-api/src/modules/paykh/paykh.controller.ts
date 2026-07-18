import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentProfilesService } from './payment-profiles.service';
import { PaymentOrdersService } from './payment-orders.service';
import { ProgramFundsService } from './program-funds.service';
import { SettlementsService } from './settlements.service';
import { IdempotencyService } from '../../infra/idempotency.service';
import {
  ActorDto,
  ApproveSettlementDto,
  CheckPaymentDto,
  CreatePaymentOrderDto,
  CreateProgramFundDto,
  CreateSettlementDto,
  FundAmountDto,
  SubmitPaymentProfileDto,
  SuspendDto,
} from './paykh.dto';

/**
 * PayKH client API (update §13). Mounted under /api/v1/paykh; only PayKH
 * credentials may reach these routes (client separation, update §3 / domain
 * config). Value-changing routes support idempotency (update §20).
 */
@ApiTags('paykh')
@Controller('api/v1/paykh')
export class PaykhController {
  constructor(
    private readonly profiles: PaymentProfilesService,
    private readonly orders: PaymentOrdersService,
    private readonly funds: ProgramFundsService,
    private readonly settlements: SettlementsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  // --- Tenant payment profiles ---
  @Post('tenants/:tenantId/payment-profiles')
  @ApiOperation({ summary: 'Submit a tenant KHQR payment profile (§13/§14)' })
  submitProfile(@Param('tenantId') tenantId: string, @Body() dto: SubmitPaymentProfileDto) {
    return this.profiles.submit({ ...dto, tenantId });
  }

  @Get('tenants/:tenantId/payment-profiles')
  @ApiOperation({ summary: 'List a tenant payment profiles' })
  listProfiles(@Param('tenantId') tenantId: string) {
    return this.profiles.listByTenant(tenantId);
  }

  @Post('payment-profiles/:profileId/verify')
  @ApiOperation({ summary: 'Trustee verifies recipient ownership (§14)' })
  verifyProfile(@Param('profileId') profileId: string, @Body() dto: ActorDto) {
    return this.profiles.verify(profileId, dto.actor);
  }

  @Post('payment-profiles/:profileId/activate')
  @ApiOperation({ summary: 'Activate an approved payment profile' })
  activateProfile(@Param('profileId') profileId: string, @Body() dto: ActorDto) {
    return this.profiles.activate(profileId, dto.actor);
  }

  @Get('payment-profiles/:profileId')
  @ApiOperation({ summary: 'Get a payment profile' })
  getProfile(@Param('profileId') profileId: string) {
    return this.profiles.get(profileId);
  }

  @Post('payment-profiles/:profileId/suspend')
  @ApiOperation({ summary: 'Suspend a payment profile' })
  suspendProfile(@Param('profileId') profileId: string, @Body() dto: SuspendDto) {
    return this.profiles.suspend(profileId, dto.actor, dto.reason);
  }

  // --- Payment orders + KHQR ---
  @Post('payment-orders')
  @ApiOperation({ summary: 'Create a payment order with a unique KHQR reference (§13)' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async createOrder(
    @Body() dto: CreatePaymentOrderDto,
    @Headers('idempotency-key') key?: string,
  ) {
    const r = await this.idempotency.run(key, 'POST /paykh/payment-orders', dto, () =>
      this.orders.create(dto),
    );
    return r.value;
  }

  @Get('payment-orders/:id')
  @ApiOperation({ summary: 'Get a payment order' })
  getOrder(@Param('id') id: string) {
    return this.orders.get(id);
  }

  @Get('payment-orders/:id/status')
  @ApiOperation({ summary: 'Payment order status' })
  orderStatus(@Param('id') id: string) {
    return this.orders.status(id);
  }

  @Post('payment-orders/:id/cancel')
  @ApiOperation({ summary: 'Cancel an unpaid payment order (§13)' })
  cancelOrder(@Param('id') id: string, @Body() dto: ActorDto) {
    return this.orders.cancel(id, dto.actor);
  }

  @Post('payment-orders/:id/refund')
  @ApiOperation({ summary: 'Refund a confirmed payment (§13)' })
  refundOrder(@Param('id') id: string, @Body() dto: SuspendDto) {
    return this.orders.refund(id, dto.actor, dto.reason);
  }

  @Post('payment-orders/:id/check-payment')
  @ApiOperation({ summary: 'Confirm a bank transaction against an order (§14)' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async checkPayment(
    @Param('id') id: string,
    @Body() dto: CheckPaymentDto,
    @Headers('idempotency-key') key?: string,
  ) {
    const r = await this.idempotency.run(
      key,
      `POST /paykh/payment-orders/${id}/check-payment`,
      dto,
      () => this.orders.checkPayment(id, dto),
    );
    return r.value;
  }

  // --- Program funds ---
  @Post('program-funds')
  @ApiOperation({ summary: 'Create a PayKH program fund (§11/§15)' })
  createFund(@Body() dto: CreateProgramFundDto) {
    return this.funds.create(dto);
  }

  @Get('program-funds/:id')
  @ApiOperation({ summary: 'Get a program fund' })
  getFund(@Param('id') id: string) {
    return this.funds.get(id);
  }

  @Get('program-funds/:id/balance')
  @ApiOperation({ summary: 'Program fund balance' })
  fundBalance(@Param('id') id: string) {
    return this.funds.balance(id);
  }

  @Post('program-funds/:id/fund')
  @ApiOperation({ summary: 'Record cleared program funding' })
  fund(@Param('id') id: string, @Body() dto: FundAmountDto) {
    return this.funds.fund(id, dto.amountMinor, dto.actor);
  }

  @Post('program-funds/:id/reserve')
  @ApiOperation({ summary: 'Reserve available program funding for an issuance' })
  reserveFund(@Param('id') id: string, @Body() dto: FundAmountDto) {
    return this.funds.reserve(id, dto.amountMinor, dto.actor);
  }

  @Post('program-funds/:id/release')
  @ApiOperation({ summary: 'Release previously reserved program funding' })
  releaseFund(@Param('id') id: string, @Body() dto: FundAmountDto) {
    return this.funds.release(id, dto.amountMinor, dto.actor);
  }

  // --- Merchant settlements ---
  @Post('settlements')
  @ApiOperation({ summary: 'Request a merchant settlement (§13)' })
  createSettlement(@Body() dto: CreateSettlementDto) {
    return this.settlements.create(dto);
  }

  @Get('settlements/:id')
  @ApiOperation({ summary: 'Get a settlement' })
  getSettlement(@Param('id') id: string) {
    return this.settlements.get(id);
  }

  @Post('settlements/:id/cancel')
  @ApiOperation({ summary: 'Cancel a settlement before confirmation (§13)' })
  cancelSettlement(@Param('id') id: string, @Body() dto: ActorDto) {
    return this.settlements.cancel(id, dto.actor);
  }

  @Post('settlements/:id/approve')
  @ApiOperation({ summary: 'Approve a settlement (maker-checker, §9)' })
  approveSettlement(@Param('id') id: string, @Body() dto: ApproveSettlementDto) {
    return this.settlements.approve(id, dto.checkerId);
  }

  @Post('settlements/:id/confirm')
  @ApiOperation({ summary: 'Confirm bank-side settlement' })
  confirmSettlement(@Param('id') id: string, @Body() dto: ActorDto) {
    return this.settlements.confirm(id, dto.actor);
  }
}
