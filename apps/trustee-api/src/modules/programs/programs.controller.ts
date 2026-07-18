import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../infra/prisma.service';

/** §27 Programs read endpoints. */
@ApiTags('programs')
@Controller('api/v1/trustee')
export class ProgramsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('programs')
  @ApiOperation({ summary: 'List regulated programs (§7)' })
  async list() {
    const programs = await this.prisma.program.findMany({
      select: {
        id: true,
        code: true,
        assetId: true,
        referenceCurrency: true,
        legalModel: true,
        reservePolicy: true,
        requiredRatioBps: true,
        status: true,
      },
    });
    return { programs };
  }

  @Get('programs/:id')
  @ApiOperation({ summary: 'Get a program' })
  async get(@Param('id') id: string) {
    return this.prisma.program.findUnique({ where: { id } });
  }

  @Get('programs/:id/status')
  @ApiOperation({ summary: 'Get program operational status' })
  async status(@Param('id') id: string) {
    const p = await this.prisma.program.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    return p;
  }
}
