import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReserveService } from './reserve.service';
import * as ser from '../../common/serialize';

/** §27 Reserves + Proof-of-Reserve read/refresh endpoints. */
@ApiTags('reserves')
@Controller('api/v1/paychain')
export class ReserveController {
  constructor(private readonly reserve: ReserveService) {}

  @Get('reserves/:programId/current')
  @ApiOperation({ summary: 'Current reserve position and mint capacity (§16/§17)' })
  async current(@Param('programId') programId: string) {
    const pos = await this.reserve.position(programId);
    return {
      programId: pos.programId,
      currency: pos.currency,
      eligibleReserve: ser.money(pos.eligibleReserve),
      reserveObligation: ser.money(pos.reserveObligation),
      requiredReserve: ser.money(pos.requiredReserve),
      mintCapacity: ser.money(pos.mintCapacity),
      surplus: ser.money(pos.surplus),
      reserveRatioBps: pos.reserveRatioBps,
      liabilityAgeSeconds: pos.liabilityAgeSeconds,
    };
  }

  @Get('reserves/:programId/mint-capacity')
  @ApiOperation({ summary: 'Mint capacity only (§17)' })
  async mintCapacity(@Param('programId') programId: string) {
    const pos = await this.reserve.position(programId);
    return { mintCapacity: ser.money(pos.mintCapacity) };
  }

  @Get('reserves/:programId/history')
  @ApiOperation({ summary: 'Reserve snapshot history (§27)' })
  history(@Param('programId') programId: string) {
    return this.reserve.snapshotHistory(programId);
  }

  @Get('reserves/:programId/ratio')
  @ApiOperation({ summary: 'Reserve ratio only (§27)' })
  ratio(@Param('programId') programId: string) {
    return this.reserve.ratio(programId);
  }

  @Get('reserve-accounts')
  @ApiOperation({ summary: 'List trustee reserve accounts, masked (§27)' })
  accounts(@Query('programId') programId?: string) {
    return this.reserve.listAccounts(programId);
  }

  @Get('reserve-accounts/:accountId')
  @ApiOperation({ summary: 'Get a reserve account (masked)' })
  account(@Param('accountId') accountId: string) {
    return this.reserve.getAccount(accountId);
  }

  @Get('reserve-accounts/:accountId/balance')
  @ApiOperation({ summary: 'Reserve account balance via program position' })
  accountBalance(@Param('accountId') accountId: string) {
    return this.reserve.accountBalance(accountId);
  }

  @Post('proof-of-reserve/:programId/snapshots')
  @ApiOperation({ summary: 'Generate a signed reserve snapshot (§22)' })
  async snapshot(@Param('programId') programId: string) {
    return this.reserve.createSnapshot(programId);
  }

  @Get('proof-of-reserve/:programId/latest')
  @ApiOperation({ summary: 'Latest signed proof-of-reserve snapshot (§22)' })
  async latest(@Param('programId') programId: string) {
    return this.reserve.latestSnapshot(programId);
  }

  @Get('proof-of-reserve/snapshots/:snapshotId')
  @ApiOperation({ summary: 'Fetch a reserve snapshot by id (§22)' })
  async byId(@Param('snapshotId') snapshotId: string) {
    return this.reserve.getSnapshot(snapshotId);
  }
}
