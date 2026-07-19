import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { ReserveService } from '../reserve/reserve.service';
import * as ser from '../../common/serialize';
import { RequirePermission } from '../../common/permission.guard';
import { Permission } from '@trustee/domain';
import { UserAuthService } from '../../infra/user-auth.service';

/**
 * Trustee admin API (RBAC/ABAC governance, §8/§9/§30). Mounted under
 * /api/v1/admin, which the client-separation guard restricts to TRUSTEE_BANK
 * credentials. Every mutation is audited.
 */
@ApiTags('admin')
@Controller('api/v1/admin')
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly reserve: ReserveService,
    private readonly userAuth: UserAuthService,
  ) {}

  @Get('permissions')
  @ApiOperation({ summary: 'Permission catalog (§8)' })
  permissions() {
    return { permissions: this.admin.permissionCatalog() };
  }

  @Get('reserve/:programId')
  @ApiOperation({ summary: 'Reserve position for the admin dashboard (§16/§17)' })
  async reservePosition(@Param('programId') programId: string) {
    const p = await this.reserve.position(programId);
    return {
      programId: p.programId,
      currency: p.currency,
      eligibleReserve: ser.money(p.eligibleReserve),
      reserveObligation: ser.money(p.reserveObligation),
      mintCapacity: ser.money(p.mintCapacity),
      reserveRatioBps: p.reserveRatioBps,
    };
  }

  // Users
  @Get('users')
  listUsers() { return this.admin.listUsers(); }

  @Post('users')
  @RequirePermission(Permission.ADMIN_USERS)
  createUser(@Body() b: { email: string; displayName: string; institution: string; roles: string[]; attributes?: unknown; password?: string; actor: string }) {
    return this.admin.createUser(b);
  }

  @Put('users/:id/roles')
  @RequirePermission(Permission.ADMIN_USERS)
  setUserRoles(@Param('id') id: string, @Body() b: { roles: string[]; actor: string }) {
    return this.admin.setUserRoles(id, b.roles, b.actor);
  }

  @Put('users/:id/disabled')
  @RequirePermission(Permission.ADMIN_USERS)
  setUserDisabled(@Param('id') id: string, @Body() b: { disabled: boolean; actor: string }) {
    return this.admin.setUserDisabled(id, b.disabled, b.actor);
  }

  @Get('users/:id/effective-permissions')
  effectivePermissions(@Param('id') id: string) { return this.admin.effectivePermissions(id); }

  @Put('users/:id/password')
  @RequirePermission(Permission.ADMIN_USERS)
  setUserPassword(@Param('id') id: string, @Body() b: { newPassword: string }) {
    return this.userAuth.adminSetPassword(id, b.newPassword);
  }

  // Roles
  @Get('roles')
  listRoles() { return this.admin.listRoles(); }

  @Put('roles/:slug')
  @RequirePermission(Permission.ADMIN_ROLES)
  upsertRole(@Param('slug') slug: string, @Body() b: { name: string; institution: string; description?: string; permissions: string[]; actor: string }) {
    return this.admin.upsertRole({ slug, ...b });
  }

  @Delete('roles/:slug')
  @RequirePermission(Permission.ADMIN_ROLES)
  deleteRole(@Param('slug') slug: string, @Query('actor') actor: string) {
    return this.admin.deleteRole(slug, actor ?? 'admin');
  }

  // ABAC policies
  @Get('policies')
  listPolicies() { return this.admin.listPolicies(); }

  @Post('policies')
  @RequirePermission(Permission.ADMIN_POLICIES)
  createPolicy(@Body() b: Parameters<AdminService['upsertPolicy']>[0]) { return this.admin.upsertPolicy(b); }

  @Put('policies/:id')
  @RequirePermission(Permission.ADMIN_POLICIES)
  updatePolicy(@Param('id') id: string, @Body() b: Parameters<AdminService['upsertPolicy']>[0]) {
    return this.admin.upsertPolicy({ ...b, id });
  }

  @Delete('policies/:id')
  @RequirePermission(Permission.ADMIN_POLICIES)
  deletePolicy(@Param('id') id: string, @Query('actor') actor: string) { return this.admin.deletePolicy(id, actor ?? 'admin'); }

  @Post('policies/evaluate')
  @ApiOperation({ summary: 'Evaluate the approval requirement for a transaction (§9)' })
  evaluate(@Body() tx: { transactionType: string; amountMinor?: string; currency?: string; riskLevel?: string; programId?: string; assetId?: string; jurisdiction?: string }) {
    return this.admin.evaluate({ ...tx, amountMinor: tx.amountMinor != null ? BigInt(tx.amountMinor) : undefined });
  }

  // Feature flags
  @Get('feature-flags')
  listFlags() { return this.admin.listFlags(); }

  @Put('feature-flags/:key')
  @RequirePermission(Permission.ADMIN_FEATURE_FLAGS)
  setFlag(@Param('key') key: string, @Body() b: { enabled: boolean; actor: string }) {
    return this.admin.setFlag(key, b.enabled, b.actor);
  }

  // Emergency controls
  @Get('controls')
  listControls() { return this.admin.listControls(); }

  @Put('controls/:key')
  @RequirePermission(Permission.ADMIN_EMERGENCY)
  setControl(@Param('key') key: string, @Body() b: { value: boolean; reason: string; incidentRef?: string; actor: string }) {
    return this.admin.setControl(key, b.value, b.reason, b.incidentRef, b.actor);
  }

  // Client applications & request signing (§28)
  @Get('clients')
  listClients() { return this.admin.listClients(); }

  @Put('clients/:platform/key')
  @RequirePermission(Permission.ADMIN_ROLES)
  setClientKey(@Param('platform') platform: string, @Body() b: { publicKeyPem?: string; requireSignature: boolean; actor: string }) {
    return this.admin.setClientKey(platform, b.publicKeyPem ?? null, b.requireSignature, b.actor);
  }

  @Post('clients/:platform/rotate-secret')
  @RequirePermission(Permission.ADMIN_ROLES)
  rotateClientSecret(@Param('platform') platform: string, @Body() b: { actor: string }) {
    return this.admin.rotateClientSecret(platform, b.actor);
  }

  @Put('clients/:platform/rate-limit')
  @RequirePermission(Permission.ADMIN_FEATURE_FLAGS)
  setClientRateLimit(@Param('platform') platform: string, @Body() b: { rateLimitPerMin: number; actor: string }) {
    return this.admin.setClientRateLimit(platform, b.rateLimitPerMin, b.actor);
  }

  @Put('clients/:platform/disabled')
  @RequirePermission(Permission.ADMIN_EMERGENCY)
  setClientDisabled(@Param('platform') platform: string, @Body() b: { disabled: boolean; actor: string }) {
    return this.admin.setClientDisabled(platform, b.disabled, b.actor);
  }

  @Get('usage')
  @ApiOperation({ summary: 'Per-client API usage (hourly) for the dashboard (§3)' })
  usage(@Query('hours') hours?: string) {
    return this.admin.usage(hours ? Number(hours) : 24);
  }

  @Get('integration-health')
  @ApiOperation({ summary: 'Live outbound-integration health (probe client receivers)' })
  integrationHealth() {
    return this.admin.integrationHealth();
  }

  // Signed-event webhooks / outbox (§29)
  @Get('webhooks')
  @ApiOperation({ summary: 'List outbox events (delivered/pending/dead)' })
  listWebhooks(@Query('status') status?: string) {
    return this.admin.listWebhooks(status);
  }

  @Get('webhooks/:id/deliveries')
  @ApiOperation({ summary: 'Per-attempt delivery log for an event (§29)' })
  webhookDeliveries(@Param('id') id: string) {
    return this.admin.webhookDeliveries(id);
  }

  @Post('webhooks/:id/replay')
  @RequirePermission(Permission.ADMIN_FEATURE_FLAGS)
  replayWebhook(@Param('id') id: string, @Body() b: { actor: string }) {
    return this.admin.replayWebhook(id, b.actor);
  }

  @Post('webhooks/replay-dead-lettered')
  @RequirePermission(Permission.ADMIN_FEATURE_FLAGS)
  replayDead(@Body() b: { actor: string }) {
    return this.admin.replayDeadLettered(b.actor);
  }
}
