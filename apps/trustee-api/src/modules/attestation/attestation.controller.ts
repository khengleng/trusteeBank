import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AttestationService, type CreateAttestation } from './attestation.service';

class ActorDto {
  @IsString() @IsNotEmpty() actor!: string;
}

/**
 * Attestation retrieval for clients (§23). Read routes are exposed under both
 * PayChain and PayKH so each client can consume signed proof artifacts. Create
 * and lifecycle transitions are trustee-bank-only (see {@link TrusteeAttestationController}).
 */
@ApiTags('paychain-attestations')
@Controller('api/v1/paychain')
export class PaychainAttestationController {
  constructor(private readonly attestation: AttestationService) {}

  @Get('attestations')
  @ApiOperation({ summary: 'List attestations (§23)' })
  list(@Query('programId') programId?: string) {
    return this.attestation.list(programId);
  }

  @Get('attestations/:id')
  @ApiOperation({ summary: 'Retrieve a signed attestation artifact (§23)' })
  get(@Param('id') id: string) {
    return this.attestation.get(id);
  }
}

@ApiTags('paykh-attestations')
@Controller('api/v1/paykh')
export class PaykhAttestationController {
  constructor(private readonly attestation: AttestationService) {}

  @Get('attestations')
  @ApiOperation({ summary: 'List proof-of-safeguarding attestations (§23)' })
  list(@Query('programId') programId?: string) {
    return this.attestation.list(programId);
  }

  @Get('attestations/:id')
  @ApiOperation({ summary: 'Retrieve a signed attestation artifact (§23)' })
  get(@Param('id') id: string) {
    return this.attestation.get(id);
  }
}

/** Trustee-bank-only attestation authoring & lifecycle (§23). */
@ApiTags('trustee-attestations')
@Controller('api/v1/bank')
export class TrusteeAttestationController {
  constructor(private readonly attestation: AttestationService) {}

  @Post('attestations')
  @ApiOperation({ summary: 'Create an attestation draft (§23)' })
  create(@Body() dto: CreateAttestation) {
    return this.attestation.create(dto);
  }

  @Post('attestations/:id/submit')
  submit(@Param('id') id: string, @Body() dto: ActorDto) {
    return this.attestation.transition(id, 'UNDER_REVIEW', dto.actor);
  }

  @Post('attestations/:id/approve')
  approve(@Param('id') id: string, @Body() dto: ActorDto) {
    return this.attestation.transition(id, 'APPROVED', dto.actor);
  }

  @Post('attestations/:id/publish')
  publish(@Param('id') id: string, @Body() dto: ActorDto) {
    return this.attestation.transition(id, 'PUBLISHED', dto.actor);
  }
}
