import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DepositsService } from './deposits.service';
import { ClearDepositDto, MatchDepositDto, RegisterDepositDto } from './deposits.dto';

/**
 * §12 Deposit endpoints. Mounted under /api/v1/bank — trustee-bank systems only,
 * reached via private connectivity/mTLS/IP allowlist (domain config). PayChain
 * and PayKH must never call these directly.
 */
@ApiTags('bank-deposits')
@Controller('api/v1/bank')
export class DepositsController {
  constructor(private readonly deposits: DepositsService) {}

  @Post('deposits')
  @ApiOperation({ summary: 'Register a bank-detected deposit (§12)' })
  register(@Body() dto: RegisterDepositDto) {
    return this.deposits.register(dto);
  }

  @Get('deposits/:id')
  @ApiOperation({ summary: 'Get a deposit' })
  get(@Param('id') id: string) {
    return this.deposits.get(id);
  }

  @Post('deposits/:id/match')
  @ApiOperation({ summary: 'Match a deposit to a funding instruction (§12)' })
  match(@Param('id') id: string, @Body() dto: MatchDepositDto) {
    return this.deposits.match(id, dto.fundingInstructionId, dto.actor);
  }

  @Post('deposits/:id/clear')
  @ApiOperation({ summary: 'Confirm cleared funds (§12)' })
  clear(@Param('id') id: string, @Body() dto: ClearDepositDto) {
    return this.deposits.clear(id, dto.actor);
  }
}
