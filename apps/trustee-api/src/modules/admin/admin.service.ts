import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '@trustee/cryptography';
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
import { ClockService } from '../../infra/clock.service';

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
    private readonly clock: ClockService,
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
    email: string; displayName: string; institution: string; roles: string[]; attributes?: unknown; password?: string; actor: string;
  }) {
    // Give operators a working login. If no password is supplied, generate a
    // one-time temporary password returned to the admin; the operator sets their
    // own via change-password and enrolls MFA on first login (mfaEnabled=false).
    const tempPassword = input.password && input.password.length >= 10 ? undefined : `Tmp!${randomBytes(9).toString('base64url')}`;
    const password = input.password && input.password.length >= 10 ? input.password : (tempPassword as string);
    const user = await this.prisma.user.create({
      data: {
        email: input.email, displayName: input.displayName, institution: input.institution,
        roles: input.roles, attributes: (input.attributes as object) ?? undefined,
        passwordHash: hashPassword(password),
      },
    });
    await this.audit.record({ actor: input.actor, action: 'admin.user.created', subjectType: 'USER', subjectId: user.id, afterState: { roles: input.roles, institution: input.institution } });
    return { id: user.id, email: user.email, tempPassword };
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

  // --- Signed-event webhooks / outbox (§29) ---
  async listWebhooks(status?: string, limit = 100) {
    const where =
      status === 'dead' ? { deadLettered: true }
      : status === 'delivered' ? { deliveredAt: { not: null } }
      : status === 'pending' ? { deliveredAt: null, deadLettered: false }
      : {};
    const events = await this.prisma.outboxEvent.findMany({
      where, orderBy: { sequence: 'desc' }, take: Math.min(limit, 500),
      select: { id: true, eventType: true, targetPlatform: true, attempts: true, deadLettered: true, deliveredAt: true, createdAt: true },
    });
    return {
      events: events.map((e) => ({
        id: e.id, eventType: e.eventType, targetPlatform: e.targetPlatform, attempts: e.attempts,
        status: e.deliveredAt ? 'DELIVERED' : e.deadLettered ? 'DEAD_LETTERED' : 'PENDING',
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Live outbound-integration health: probe each client's webhook receiver and
   * classify it, plus the outbox backlog. Green = configured/accepting,
   * amber = deployed-but-unconfigured, red = missing/unreachable.
   */
  async integrationHealth() {
    const clients = await this.prisma.clientApplication.findMany({
      where: { platform: { in: ['PAYCHAIN', 'PAYKH'] } },
      select: { platform: true, webhookUrl: true },
    });
    const probes = await Promise.all(
      clients.map(async (c) => {
        if (!c.webhookUrl) return { platform: c.platform, webhookUrl: null, httpStatus: null, state: 'NO_URL', detail: 'no webhook URL registered' };
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        try {
          const res = await fetch(c.webhookUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ probe: true }),
            signal: controller.signal,
          });
          const state =
            res.status === 404 ? 'MISSING'
            : res.status === 503 ? 'DEPLOYED_UNCONFIGURED'
            : res.status === 401 || res.status === 400 ? 'CONFIGURED'
            : res.status >= 200 && res.status < 300 ? 'ACCEPTING'
            : 'UNREACHABLE';
          const detail =
            state === 'MISSING' ? 'endpoint not implemented'
            : state === 'DEPLOYED_UNCONFIGURED' ? 'endpoint deployed, awaiting config (WEBHOOK key)'
            : state === 'CONFIGURED' ? 'endpoint live, rejecting our unsigned probe (verifying)'
            : state === 'ACCEPTING' ? 'endpoint accepting'
            : `unexpected HTTP ${res.status}`;
          return { platform: c.platform, webhookUrl: c.webhookUrl, httpStatus: res.status, state, detail };
        } catch (err) {
          return { platform: c.platform, webhookUrl: c.webhookUrl, httpStatus: null, state: 'UNREACHABLE', detail: (err as Error).name === 'AbortError' ? 'timeout' : (err as Error).message };
        } finally {
          clearTimeout(timer);
        }
      }),
    );
    const [dead, pending, delivered] = await Promise.all([
      this.prisma.outboxEvent.count({ where: { deadLettered: true } }),
      this.prisma.outboxEvent.count({ where: { deliveredAt: null, deadLettered: false } }),
      this.prisma.outboxEvent.count({ where: { deliveredAt: { not: null } } }),
    ]);
    return { checkedAt: this.clock.nowIso(), clients: probes, outbox: { deadLettered: dead, pending, delivered } };
  }

  /** Per-attempt delivery log for one event (§29) — for debugging receivers. */
  async webhookDeliveries(eventId: string) {
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: { eventId }, orderBy: { createdAt: 'asc' },
    });
    return {
      deliveries: deliveries.map((d) => ({
        attempt: d.attempt, statusCode: d.statusCode, ok: d.ok,
        error: d.error, at: d.createdAt.toISOString(),
      })),
    };
  }

  /** Re-queue a single event for delivery (§29 manual replay). */
  async replayWebhook(id: string, actor: string) {
    await this.prisma.outboxEvent.update({
      where: { id }, data: { deliveredAt: null, deadLettered: false, attempts: 0 },
    });
    await this.audit.record({ actor, action: 'admin.webhook.replayed', subjectType: 'OUTBOX_EVENT', subjectId: id });
    return { id, requeued: true };
  }

  /** Re-queue every dead-lettered event (e.g. after a client receiver goes live). */
  async replayDeadLettered(actor: string) {
    const res = await this.prisma.outboxEvent.updateMany({
      where: { deadLettered: true }, data: { deadLettered: false, attempts: 0, deliveredAt: null },
    });
    await this.audit.record({ actor, action: 'admin.webhook.replay_all', subjectType: 'OUTBOX_EVENT', afterState: { count: res.count } });
    return { requeued: res.count };
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
