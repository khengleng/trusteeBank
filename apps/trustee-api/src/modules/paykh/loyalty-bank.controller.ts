import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoyaltyService } from './loyalty.service';

/**
 * Trustee-bank proof-of-reserve view over backed loyalty stablecoins (§23/§26).
 * Mounted under /api/v1/bank so only trustee-bank credentials reach it. This is
 * READ + independent reconciliation only — issuing and redeeming stay with PayKH
 * (/api/v1/paykh/loyalty). The trustee's job here is to prove the reserve, not
 * to mint or move loyalty value.
 */
@ApiTags('bank')
@Controller('api/v1/bank')
export class LoyaltyBankController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('loyalty-liabilities')
  @ApiOperation({ summary: 'List backed loyalty stablecoin liabilities (proof of reserve)' })
  list() {
    return this.loyalty.listLiabilities();
  }

  @Get('loyalty-liabilities/:id')
  @ApiOperation({ summary: 'Get a loyalty stablecoin liability' })
  get(@Param('id') id: string) {
    return this.loyalty.get(id);
  }

  @Post('loyalty-liabilities/:id/reconcile')
  @ApiOperation({ summary: 'Independently reconcile ledger vs on-chain supply (§23)' })
  reconcile(@Param('id') id: string) {
    return this.loyalty.reconcile(id);
  }
}
