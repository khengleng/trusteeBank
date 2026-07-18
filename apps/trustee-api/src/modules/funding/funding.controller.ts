import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FundingService } from './funding.service';
import { CreateFundingInstructionDto } from './funding.dto';
import { IdempotencyService } from '../../infra/idempotency.service';

/** §27 Funding endpoints. Value-changing routes support idempotency (§27). */
@ApiTags('funding')
@Controller('api/v1/paychain')
export class FundingController {
  constructor(
    private readonly funding: FundingService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('funding-instructions')
  @ApiOperation({ summary: 'Create a funding instruction (§13)' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async create(
    @Body() dto: CreateFundingInstructionDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const result = await this.idempotency.run(
      idempotencyKey,
      'POST /funding-instructions',
      dto,
      () => this.funding.create(dto),
    );
    return result.value;
  }

  @Get('funding-instructions/:id')
  @ApiOperation({ summary: 'Get a funding instruction' })
  async get(@Param('id') id: string) {
    return this.funding.get(id);
  }

  @Get('funding-instructions/:id/status')
  @ApiOperation({ summary: 'Funding instruction status' })
  async status(@Param('id') id: string) {
    return this.funding.status(id);
  }

  @Post('funding-instructions/:id/cancel')
  @ApiOperation({ summary: 'Cancel an unfunded funding instruction (§27)' })
  async cancel(@Param('id') id: string, @Body() body: { actor: string }) {
    return this.funding.cancel(id, body.actor);
  }
}
