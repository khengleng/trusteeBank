import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FundClassification, backingPolicyFor } from '@trustee/domain';
import { PrismaService } from '../../infra/prisma.service';

class CreateRegistryEntryDto {
  @IsString() @IsNotEmpty() trusteeProgramId!: string;
  @IsString() @IsNotEmpty() platform!: string;
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsString() paykhProgramId?: string;
  @IsOptional() @IsString() paychainAssetId?: string;
  @IsString() @IsNotEmpty() liabilityType!: FundClassification;
  @IsString() @IsNotEmpty() reserveAccountId!: string;
  @IsString() @Length(3, 3) currency!: string;
  @IsOptional() @IsInt() requiredReserveBps?: number;
  @IsOptional() @IsBoolean() mintAuthorizationRequired?: boolean;
  @IsOptional() @IsBoolean() redemptionAuthorizationRequired?: boolean;
}

/**
 * Shared reserve & liability registry (update §17). Connects a trustee program
 * and reserve account to a PayKH program/tenant and/or a PayChain asset with the
 * fund classification and backing policy. Defaults for backing/authorization are
 * derived from the fund classification engine when not supplied.
 */
@ApiTags('registry')
@Controller('api/v1/trustee')
export class RegistryController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('liability-registry')
  @ApiOperation({ summary: 'Register a trustee↔client liability mapping (§17)' })
  async create(@Body() dto: CreateRegistryEntryDto) {
    const policy = backingPolicyFor(dto.liabilityType);
    const entry = await this.prisma.liabilityRegistryEntry.create({
      data: {
        trusteeProgramId: dto.trusteeProgramId,
        platform: dto.platform,
        tenantId: dto.tenantId ?? null,
        paykhProgramId: dto.paykhProgramId ?? null,
        paychainAssetId: dto.paychainAssetId ?? null,
        liabilityType: dto.liabilityType,
        reserveAccountId: dto.reserveAccountId,
        currency: dto.currency,
        requiredReserveBps: dto.requiredReserveBps ?? policy.requiredBackingBps,
        mintAuthorizationRequired:
          dto.mintAuthorizationRequired ?? policy.authorizationRequired,
        redemptionAuthorizationRequired:
          dto.redemptionAuthorizationRequired ?? policy.authorizationRequired,
      },
    });
    return { id: entry.id, backingPolicy: policy };
  }

  @Get('liability-registry')
  @ApiOperation({ summary: 'List liability registry entries' })
  async list() {
    const entries = await this.prisma.liabilityRegistryEntry.findMany();
    return { entries };
  }
}
