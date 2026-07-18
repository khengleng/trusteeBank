import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ALL_PERMISSIONS,
  evaluateAbac,
  type AbacPolicyRule,
  type AbacTransaction,
} from '@trustee/domain';
import { PrismaService } from '../../infra/prisma.service';
import { AuditService } from '../../infra/audit.service';
import { FeatureFlagsService } from '../../infra/feature-flags.service';
import { NotificationService } from '../../infra/notification.service';
import { RateLimitService } from '../../infra/rate-limit.service';

/**
 * Trustee admin operations: RBAC (users/roles), ABAC (approval policies),
 * feature flags and emergency controls (§8, §9, §30). Every mutation is audited.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly flags: FeatureFlagsService,
    private readonly notify: NotificationService,
    private readonly rateLimit: RateLimitService,
  ) {}

  permissionCatalog(): readonly string[] {
    return ALL_PERMISSIONS;
  }

  // --- Users (RBAC) ---
  async listUsers() {
    const users = await this.prisma.user.findMany({
      select: { id: true, email: true, displayName: true, institution: true, roles: true, disabled: true },
      orderBy: { createdAt: 'asc' },
    });
    return { users };
  }

  async createUser(input: {
    email: string; displayName: string; institution: string; roles: string[]; attributes?: unknown; actor: string;
  }) {
    const user = await this.prisma.user.create({
      data: {
        email: input.email, displayName: input.displayName, institution: input.institution,
        roles: input.roles, attributes: (input.attributes as object) ?? undefined,
      },
    });
    await this.audit.record({ actor: input.actor, action: 'admin.user.created', subjectType: 'USER', subjectId: user.id, afterState: { roles: input.roles } });
    return { id: user.id, email: user.email };
  }

  async setUserRoles(userId: string, roles: string[], actor: string) {
    const before = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!before) throw new NotFoundException('User not found');
    await this.prisma.user.update({ where: { id: userId }, data: { roles } });
    await this.audit.record({ actor, action: 'admin.user.roles_changed', subjectType: 'USER', subjectId: userId, beforeState: { roles: before.roles }, afterState: { roles } });
    return { id: userId, roles };
  }

  async setUserDisabled(userId: string, disabled: boolean, actor: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { disabled } });
    await this.audit.record({ actor, action: disabled ? 'admin.user.disabled' : 'admin.user.enabled', subjectType: 'USER', subjectId: userId });
    return { id: userId, disabled };
  }

  // --- Roles ---
  async listRoles() {
    const roles = await this.prisma.role.findMany({ orderBy: { slug: 'asc' } });
    return { roles };
  }

  async upsertRole(input: { slug: string; name: string; institution: string; description?: string; permissions: string[]; actor: string; }) {
    const invalid = input.permissions.filter((p) => !ALL_PERMISSIONS.includes(p as never));
    if (invalid.length) throw new BadRequestException({ message: 'Unknown permissions', invalid });
    const role = await this.prisma.role.upsert({
      where: { slug: input.slug },
      update: { name: input.name, description: input.description ?? null, institution: input.institution, permissions: input.permissions },
      create: { slug: input.slug, name: input.name, description: input.description ?? null, institution: input.institution, permissions: input.permissions },
    });
    await this.audit.record({ actor: input.actor, action: 'admin.role.upserted', subjectType: 'ROLE', subjectId: role.slug, afterState: { permissions: input.permissions } });
    return role;
  }

  async deleteRole(slug: string, actor: string) {
    const role = await this.prisma.role.findUnique({ where: { slug } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.builtin) throw new BadRequestException('Cannot delete a built-in role');
    await this.prisma.role.delete({ where: { slug } });
    await this.audit.record({ actor, action: 'admin.role.deleted', subjectType: 'ROLE', subjectId: slug });
    return { slug, deleted: true };
  }

  /** Effective permissions for a user from the union of their roles. */
  async effectivePermissions(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const roles = await this.prisma.role.findMany({ where: { slug: { in: user.roles } } });
    const perms = new Set<string>();
    for (const r of roles) r.permissions.forEach((p) => perms.add(p));
    return { userId, roles: user.roles, permissions: [...perms].sort() };
  }

  // --- ABAC approval policies ---
  async listPolicies() {
    const policies = await this.prisma.abacPolicy.findMany({ orderBy: [{ transactionType: 'asc' }, { priority: 'desc' }] });
    return { policies: policies.map(serializePolicy) };
  }

  async upsertPolicy(input: PolicyInput & { id?: string; actor: string }) {
    const data = {
      name: input.name, description: input.description ?? null, transactionType: input.transactionType,
      minAmountMinor: input.minAmountMinor != null ? BigInt(input.minAmountMinor) : null,
      maxAmountMinor: input.maxAmountMinor != null ? BigInt(input.maxAmountMinor) : null,
      currency: input.currency ?? null, riskLevel: input.riskLevel ?? null, programId: input.programId ?? null,
      assetId: input.assetId ?? null, jurisdiction: input.jurisdiction ?? null,
      requiredApprovals: input.requiredApprovals ?? 2, requiredRoles: input.requiredRoles ?? [],
      effect: input.effect ?? 'REQUIRE', priority: input.priority ?? 100, enabled: input.enabled ?? true,
    };
    const policy = input.id
      ? await this.prisma.abacPolicy.update({ where: { id: input.id }, data })
      : await this.prisma.abacPolicy.create({ data });
    await this.audit.record({ actor: input.actor, action: 'admin.policy.upserted', subjectType: 'ABAC_POLICY', subjectId: policy.id, afterState: { transactionType: policy.transactionType, effect: policy.effect } });
    return serializePolicy(policy);
  }

  async deletePolicy(id: string, actor: string) {
    await this.prisma.abacPolicy.delete({ where: { id } });
    await this.audit.record({ actor, action: 'admin.policy.deleted', subjectType: 'ABAC_POLICY', subjectId: id });
    return { id, deleted: true };
  }

  /** Evaluate the approval requirement for a hypothetical transaction (§9). */
  async evaluate(tx: AbacTransaction) {
    const rows = await this.prisma.abacPolicy.findMany({ where: { transactionType: tx.transactionType, enabled: true } });
    const rules: AbacPolicyRule[] = rows.map((r) => ({
      id: r.id, transactionType: r.transactionType, minAmountMinor: r.minAmountMinor, maxAmountMinor: r.maxAmountMinor,
      currency: r.currency, riskLevel: r.riskLevel, programId: r.programId, assetId: r.assetId, jurisdiction: r.jurisdiction,
      requiredApprovals: r.requiredApprovals, requiredRoles: r.requiredRoles, effect: r.effect, priority: r.priority, enabled: r.enabled,
    }));
    return evaluateAbac(rules, tx);
  }

  // --- Feature flags ---
  async listFlags() {
    const flags = await this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
    return { flags };
  }

  async setFlag(key: string, enabled: boolean, actor: string) {
    // Guardrail: real-funds and automatic-approval require an explicit override flow.
    await this.flags.set(key, enabled, actor);
    await this.audit.record({ actor, action: 'admin.feature_flag.set', subjectType: 'FEATURE_FLAG', subjectId: key, afterState: { enabled } });
    return { key, enabled };
  }

  // --- Emergency controls (§30) ---
  async setControl(key: string, value: boolean, reason: string, incidentRef: string | undefined, actor: string) {
    const control = await this.prisma.platformControl.upsert({
      where: { key }, update: { value, reason, incidentRef: incidentRef ?? null, setBy: actor },
      create: { key, value, reason, incidentRef: incidentRef ?? null, setBy: actor },
    });
    await this.audit.record({ actor, action: 'admin.control.set', subjectType: 'PLATFORM_CONTROL', subjectId: key, reason, afterState: { value } });
    // Notify authorized stakeholders of the emergency action (§30).
    await this.notify.notify(
      `Emergency control ${value ? 'ACTIVATED' : 'cleared'}: ${key}`,
      `Control "${key}" set to ${value} by ${actor}.\nReason: ${reason}\nIncident: ${incidentRef ?? 'n/a'}`,
    );
    return control;
  }

  async listControls() {
    const controls = await this.prisma.platformControl.findMany({ orderBy: { key: 'asc' } });
    return { controls };
  }

  // --- Client applications, request signing (§28), rate limits (§3) ---
  async listClients() {
    const clients = await this.prisma.clientApplication.findMany({
      select: { platform: true, oauthClientId: true, webhookUrl: true, requireSignature: true, publicKeyPem: true, rateLimitPerMin: true, disabled: true },
    });
    return {
      clients: clients.map((c) => ({ ...c, hasPublicKey: Boolean(c.publicKeyPem), publicKeyPem: undefined })),
    };
  }

  /** Update a client's per-minute rate limit (§3). */
  async setClientRateLimit(platform: string, rateLimitPerMin: number, actor: string) {
    if (rateLimitPerMin < 1 || rateLimitPerMin > 1_000_000) {
      throw new BadRequestException('rateLimitPerMin must be between 1 and 1,000,000');
    }
    const client = await this.prisma.clientApplication.update({
      where: { platform }, data: { rateLimitPerMin }, select: { platform: true, rateLimitPerMin: true },
    });
    await this.audit.record({
      actor, action: 'admin.client.rate_limit_updated', subjectType: 'CLIENT_APPLICATION', subjectId: platform,
      afterState: { rateLimitPerMin },
    });
    return client;
  }

  async setClientDisabled(platform: string, disabled: boolean, actor: string) {
    const client = await this.prisma.clientApplication.update({
      where: { platform }, data: { disabled }, select: { platform: true, disabled: true },
    });
    await this.audit.record({
      actor, action: disabled ? 'admin.client.disabled' : 'admin.client.enabled',
      subjectType: 'CLIENT_APPLICATION', subjectId: platform,
    });
    return client;
  }

  /** Hourly API usage per client for the dashboard (§3). */
  async usage(hours = 24) {
    const clients = await this.prisma.clientApplication.findMany({
      select: { platform: true, oauthClientId: true, rateLimitPerMin: true },
    });
    const rows = await Promise.all(
      clients.map(async (c) => ({
        platform: c.platform,
        clientId: c.oauthClientId,
        rateLimitPerMin: c.rateLimitPerMin,
        hourly: await this.rateLimit.usage(c.oauthClientId, hours),
      })),
    );
    return { usage: rows.map((r) => ({ ...r, total: r.hourly.reduce((s, h) => s + h.count, 0) })) };
  }

  async setClientKey(platform: string, publicKeyPem: string | null, requireSignature: boolean, actor: string) {
    const client = await this.prisma.clientApplication.update({
      where: { platform },
      data: { publicKeyPem, requireSignature },
      select: { platform: true, requireSignature: true },
    });
    await this.audit.record({
      actor, action: 'admin.client.key_updated', subjectType: 'CLIENT_APPLICATION', subjectId: platform,
      afterState: { requireSignature, hasKey: Boolean(publicKeyPem) },
    });
    return client;
  }
}

interface PolicyInput {
  name: string; description?: string; transactionType: string;
  minAmountMinor?: string | number | null; maxAmountMinor?: string | number | null;
  currency?: string | null; riskLevel?: string | null; programId?: string | null; assetId?: string | null; jurisdiction?: string | null;
  requiredApprovals?: number; requiredRoles?: string[]; effect?: string; priority?: number; enabled?: boolean;
}

function serializePolicy(p: {
  id: string; name: string; transactionType: string; minAmountMinor: bigint | null; maxAmountMinor: bigint | null;
  currency: string | null; riskLevel: string | null; requiredApprovals: number; requiredRoles: string[]; effect: string; priority: number; enabled: boolean;
}) {
  return {
    id: p.id, name: p.name, transactionType: p.transactionType,
    minAmountMinor: p.minAmountMinor?.toString() ?? null, maxAmountMinor: p.maxAmountMinor?.toString() ?? null,
    currency: p.currency, riskLevel: p.riskLevel, requiredApprovals: p.requiredApprovals,
    requiredRoles: p.requiredRoles, effect: p.effect, priority: p.priority, enabled: p.enabled,
  };
}
