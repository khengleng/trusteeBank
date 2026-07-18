import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Feature flags (§40). High-risk functions default disabled; `mint.auto-approval`
 * is never enabled by default. Flags are read from the database so operators can
 * toggle them without a redeploy.
 */
@Injectable()
export class FeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns the flag value, or `fallback` (default false) when the flag is unset. */
  async isEnabled(key: string, fallback = false): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({ where: { key } });
    return flag ? flag.enabled : fallback;
  }

  async requireEnabled(key: string): Promise<void> {
    if (!(await this.isEnabled(key))) {
      throw new Error(`Feature "${key}" is disabled`);
    }
  }

  async set(key: string, enabled: boolean, updatedBy: string): Promise<void> {
    await this.prisma.featureFlag.upsert({
      where: { key },
      update: { enabled, updatedBy },
      create: { key, enabled, updatedBy },
    });
  }
}
