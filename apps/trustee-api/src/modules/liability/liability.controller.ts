import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LiabilityService, type LiabilitySnapshotInput } from './liability.service';

/** §15 PayChain liability feed intake. */
@ApiTags('liability')
@Controller('api/v1/paychain')
export class LiabilityController {
  constructor(private readonly liability: LiabilityService) {}

  @Post('liability-snapshots')
  @ApiOperation({ summary: 'Ingest a signed PayChain liability snapshot (§15)' })
  async ingest(@Body() body: LiabilitySnapshotInput) {
    return this.liability.ingest(body);
  }
}
