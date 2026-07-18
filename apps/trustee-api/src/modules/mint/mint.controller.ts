import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MintService } from './mint.service';
import {
  ApproveMintDto,
  ConfirmMintDto,
  RequestMintAuthorizationDto,
  ReviewMintDto,
  RevokeMintDto,
} from './mint.dto';
import { IdempotencyService } from '../../infra/idempotency.service';

/**
 * PayChain-facing mint routes (§18/§19). PayChain may only REQUEST a mint and
 * CONFIRM a completed blockchain mint. It cannot maker/checker its own request —
 * those are trustee-bank-only (see {@link TrusteeMintController}), satisfying
 * §8/§49 ("PayChain users must not approve trustee-bank reserve movements").
 */
@ApiTags('paychain-minting')
@Controller('api/v1/paychain')
export class MintController {
  constructor(
    private readonly mint: MintService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('mint-authorizations')
  @ApiOperation({ summary: 'PayChain requests a mint authorization (§18)' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async request(
    @Body() dto: RequestMintAuthorizationDto,
    @Headers('idempotency-key') key?: string,
  ) {
    const result = await this.idempotency.run(key, 'POST /mint-authorizations', dto, () =>
      this.mint.request(dto),
    );
    return result.value;
  }

  @Get('mint-authorizations/:id')
  @ApiOperation({ summary: 'Get a mint authorization' })
  get(@Param('id') id: string) {
    return this.mint.get(id);
  }

  @Post('mint-authorizations/:id/confirm')
  @ApiOperation({ summary: 'PayChain confirms the blockchain mint (§19)' })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async confirm(
    @Param('id') id: string,
    @Body() dto: ConfirmMintDto,
    @Headers('idempotency-key') key?: string,
  ) {
    const result = await this.idempotency.run(
      key,
      `POST /mint-authorizations/${id}/confirm`,
      dto,
      () => this.mint.confirm(id, dto),
    );
    return result.value;
  }
}

/**
 * Trustee-bank-only mint maker/checker routes (§9). Mounted under /api/v1/bank,
 * which the client-separation guard restricts to TRUSTEE_BANK credentials, so
 * PayChain can never reach approve/reject/revoke.
 */
@ApiTags('trustee-minting')
@Controller('api/v1/bank')
export class TrusteeMintController {
  constructor(private readonly mint: MintService) {}

  @Post('mint-authorizations/:id/review')
  @ApiOperation({ summary: 'Trustee maker reviews a PayChain request (§9)' })
  review(@Param('id') id: string, @Body() dto: ReviewMintDto) {
    return this.mint.review(id, dto.makerId);
  }

  @Post('mint-authorizations/:id/approve')
  @ApiOperation({ summary: 'Trustee checker approves; signs and issues (§9/§18)' })
  approve(@Param('id') id: string, @Body() dto: ApproveMintDto) {
    return this.mint.approve(id, dto.checkerId, dto.reason);
  }

  @Post('mint-authorizations/:id/reject')
  @ApiOperation({ summary: 'Trustee checker rejects a mint authorization' })
  reject(@Param('id') id: string, @Body() dto: ApproveMintDto) {
    return this.mint.reject(id, dto.checkerId, dto.reason);
  }

  @Post('mint-authorizations/:id/revoke')
  @ApiOperation({ summary: 'Trustee revokes an issued-but-unused authorization (§18)' })
  revoke(@Param('id') id: string, @Body() dto: RevokeMintDto) {
    return this.mint.revoke(id, dto.actor, dto.reason);
  }
}
