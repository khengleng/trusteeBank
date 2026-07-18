import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infra/prisma.service';
import { SigningService } from '../../infra/signing.service';

/**
 * Health and public-key endpoints. The health endpoint returns limited output
 * (domain config §7). Public keys let PayChain, PayKH and auditors verify signed
 * mint authorizations, reserve snapshots and webhooks (§28/§29/§38).
 */
@ApiTags('system')
@Controller()
export class SystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly signing: SigningService,
  ) {}

  @Get('health')
  @ApiOperation({ summary: 'Liveness/readiness with limited output' })
  async health() {
    let db = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      db = true;
    } catch {
      db = false;
    }
    return { status: db ? 'ok' : 'degraded', db };
  }

  @Get('.well-known/trustee-signing-keys')
  @ApiOperation({ summary: 'Public signing keys for signature verification (§38)' })
  keys() {
    return { keys: this.signing.allPublicKeys() };
  }
}
