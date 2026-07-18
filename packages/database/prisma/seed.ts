/**
 * Seed the platform with a demo trustee program, accounts, users, and the
 * §40 feature flags (high-risk functions default disabled). This seed contains
 * NO real customer or reserve data — it is for local/Railway demo only (§5).
 */
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { BUILTIN_ROLES } from '@trustee/domain';
import { hashPassword, otpauthUrl } from '@trustee/cryptography';

const prisma = new PrismaClient();

// Deterministic base32 TOTP secret derived from the salt so the demo otpauth URL
// stays valid across re-seeds. Production issues per-user random secrets via the
// enrollment flow (/api/v1/auth/mfa/setup).
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function deterministicMfaSecret(account: string): string {
  const bytes = createHash('sha256').update(`${SECRET_SALT}:${account}:mfa`).digest().subarray(0, 20);
  let bits = 0, value = 0, out = '';
  for (const b of bytes) { value = (value << 8) | b; bits += 8; while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function deterministicPassword(account: string): string {
  const d = createHash('sha256').update(`${SECRET_SALT}:${account}:password`).digest('base64url').slice(0, 20);
  return `Tr!${d}`;
}

// Deterministic pilot client secrets (reproducible across re-seeds, printed
// once so operators can configure PayChain/PayKH). ROTATE for production (§27).
const SECRET_SALT = process.env.CLIENT_SECRET_SALT ?? 'cambobia-trustee-pilot';
function pilotSecret(platform: string): string {
  return createHash('sha256').update(`${SECRET_SALT}:${platform}:client-secret`).digest('base64url').slice(0, 40);
}
function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

// Shared feature flags (update §28). High-risk functions default disabled;
// production real-funds and automatic-approval are NEVER on by default.
const FEATURE_FLAGS: Array<{ key: string; enabled: boolean; description: string }> = [
  { key: 'trustee.platform.enabled', enabled: true, description: 'Master platform switch' },
  { key: 'trustee.paychain.enabled', enabled: true, description: 'PayChain client integration' },
  { key: 'trustee.paykh.enabled', enabled: true, description: 'PayKH client integration' },

  { key: 'paychain.funding.enabled', enabled: true, description: 'PayChain funding instructions' },
  { key: 'paychain.reserve.enabled', enabled: true, description: 'PayChain reserve calculation' },
  { key: 'paychain.mint-authorization.enabled', enabled: true, description: 'Manual maker-checker mint authorization' },
  { key: 'paychain.redemption.enabled', enabled: true, description: 'PayChain redemption intake' },
  { key: 'paychain.proof-of-reserve.enabled', enabled: true, description: 'Internal proof-of-reserve snapshots' },

  { key: 'paykh.payment-confirmation.enabled', enabled: true, description: 'PayKH bank-payment confirmation' },
  { key: 'paykh.khqr.enabled', enabled: true, description: 'PayKH KHQR payment orders' },
  { key: 'paykh.merchant-settlement.enabled', enabled: true, description: 'PayKH merchant settlement' },
  { key: 'paykh.program-funding.enabled', enabled: true, description: 'PayKH program-fund safeguarding' },
  { key: 'paykh.cashback-funding.enabled', enabled: false, description: 'PayKH cashback issuance' },
  { key: 'paykh.giftcard-funding.enabled', enabled: false, description: 'PayKH gift-card issuance' },
  { key: 'paykh.proof-of-safeguarding.enabled', enabled: true, description: 'PayKH proof-of-safeguarding' },

  { key: 'bank.core-api.enabled', enabled: false, description: 'Live core-banking API' },
  { key: 'bank.statement-import.enabled', enabled: true, description: 'Bank statement import' },
  { key: 'bank.payout.enabled', enabled: false, description: 'Fiat payout execution' },

  // Compatibility alias used by the mint guard service.
  { key: 'mint.authorization.enabled', enabled: true, description: 'Alias of paychain.mint-authorization.enabled' },

  { key: 'production.real-funds.enabled', enabled: false, description: 'Process real regulated funds (requires bank approval)' },
  { key: 'production.automatic-approval.enabled', enabled: false, description: 'Automatic approval (never default on)' },
];

const CLIENT_APPS: Array<{
  platform: string;
  displayName: string;
  oauthClientId: string;
  webhookUrl: string;
}> = [
  {
    platform: 'PAYCHAIN',
    displayName: 'PayChain (paychain.cambobia.com)',
    oauthClientId: 'client_paychain_demo',
    webhookUrl: 'https://api.paychain.cambobia.com/api/v1/trustee/events',
  },
  {
    platform: 'PAYKH',
    displayName: 'PayKH (paykh.cambobia.com)',
    oauthClientId: 'client_paykh_demo',
    webhookUrl: 'https://api.paykh.cambobia.com/api/v1/trustee/events',
  },
  {
    platform: 'TRUSTEE_BANK',
    displayName: 'Trustee Bank Admin Console',
    oauthClientId: 'client_trustee_bank',
    webhookUrl: 'https://trustee.cambobia.com/api/v1/trustee/events',
  },
];

// Default ABAC approval policies (§9): high-value mints need a third approval.
const ABAC_POLICIES = [
  {
    name: 'High-value mint requires treasury approval',
    transactionType: 'MINT_AUTHORIZATION',
    minAmountMinor: 1_000_000_00n, // >= 1,000,000.00
    requiredApprovals: 3,
    requiredRoles: ['trustee_operations_checker', 'treasury_checker'],
    effect: 'REQUIRE',
    priority: 200,
  },
  {
    name: 'High-value payout requires treasury approval',
    transactionType: 'PAYOUT',
    minAmountMinor: 500_000_00n,
    requiredApprovals: 3,
    requiredRoles: ['treasury_checker'],
    effect: 'REQUIRE',
    priority: 200,
  },
];

const PLATFORM_CONTROLS = [
  'platform.read-only',
  'mint.global-suspend',
  'redemption.global-suspend',
  'payout.global-suspend',
  'paychain.api-suspend',
  'paykh.api-suspend',
];

async function main(): Promise<void> {
  for (const flag of FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: { description: flag.description },
      create: { key: flag.key, enabled: flag.enabled, description: flag.description },
    });
  }

  const issuedSecrets: Array<{ platform: string; clientId: string; secret: string }> = [];
  for (const c of CLIENT_APPS) {
    const secret = pilotSecret(c.platform);
    await prisma.clientApplication.upsert({
      where: { platform: c.platform },
      update: { webhookUrl: c.webhookUrl, displayName: c.displayName, clientSecretHash: hashSecret(secret) },
      create: {
        platform: c.platform,
        displayName: c.displayName,
        oauthClientId: c.oauthClientId,
        webhookUrl: c.webhookUrl,
        clientSecretHash: hashSecret(secret),
        ipAllowlist: [],
      },
    });
    issuedSecrets.push({ platform: c.platform, clientId: c.oauthClientId, secret });
  }

  // Built-in RBAC roles (§8).
  for (const r of BUILTIN_ROLES) {
    await prisma.role.upsert({
      where: { slug: r.slug },
      update: { name: r.name, institution: r.institution, permissions: r.permissions, builtin: true },
      create: { slug: r.slug, name: r.name, institution: r.institution, permissions: r.permissions, builtin: true },
    });
  }

  // Super administrator (§8). Password is set; 2FA is enrolled on first login by
  // scanning the QR in the admin console (mfaEnabled defaults false). Preserve an
  // already-enrolled MFA on re-seed so we don't reset a live operator's 2FA.
  const superEmail = 'contact@cambobia.com';
  const superPassword = deterministicPassword(superEmail);
  const existingSuper = await prisma.user.findUnique({ where: { email: superEmail } });
  await prisma.user.upsert({
    where: { email: superEmail },
    update: { roles: ['trustee_super_admin'], institution: 'TRUSTEE_BANK', passwordHash: hashPassword(superPassword) },
    create: {
      email: superEmail, displayName: 'Cambobia Super Admin', institution: 'TRUSTEE_BANK',
      roles: ['trustee_super_admin'], passwordHash: hashPassword(superPassword),
    },
  });
  const superMfaState = existingSuper?.mfaEnabled ? 'already enrolled (unchanged)' : 'set up on first login via QR';

  // Default ABAC approval policies (§9) — idempotent by name.
  for (const p of ABAC_POLICIES) {
    const existing = await prisma.abacPolicy.findFirst({ where: { name: p.name } });
    if (!existing) {
      await prisma.abacPolicy.create({
        data: {
          name: p.name, transactionType: p.transactionType, minAmountMinor: p.minAmountMinor,
          requiredApprovals: p.requiredApprovals, requiredRoles: p.requiredRoles, effect: p.effect, priority: p.priority,
        },
      });
    }
  }

  // Emergency controls default to off (§30).
  for (const key of PLATFORM_CONTROLS) {
    await prisma.platformControl.upsert({ where: { key }, update: {}, create: { key, value: false } });
  }

  const maker = await prisma.user.upsert({
    where: { email: 'ops.maker@trustee.demo' },
    update: {},
    create: {
      email: 'ops.maker@trustee.demo',
      displayName: 'Demo Ops Maker',
      institution: 'TRUSTEE_BANK',
      roles: ['trustee_operations_maker'],
    },
  });

  const checker = await prisma.user.upsert({
    where: { email: 'ops.checker@trustee.demo' },
    update: {},
    create: {
      email: 'ops.checker@trustee.demo',
      displayName: 'Demo Ops Checker',
      institution: 'TRUSTEE_BANK',
      roles: ['trustee_operations_checker'],
    },
  });

  const program = await prisma.program.upsert({
    where: { code: 'DEMO-PUSD' },
    update: {},
    create: {
      code: 'DEMO-PUSD',
      legalEntityId: 'legal_demo',
      issuerId: 'issuer_paychain_demo',
      trusteeBankId: 'bank_demo',
      assetId: 'PUSD',
      referenceCurrency: 'USD',
      legalModel: 'SAFEGUARDED_CUSTOMER_FUNDS',
      regulatoryStatus: 'PILOT',
      reservePolicy: 'FULL_100',
      requiredRatioBps: 10000,
      safetyBufferBps: 0,
      agreementReferences: ['TRUST-AGREEMENT-DEMO-001'],
      effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
      status: 'ACTIVE',
    },
  });

  await prisma.trusteeAccount.upsert({
    where: { id: 'demo-reserve-account' },
    update: {},
    create: {
      id: 'demo-reserve-account',
      programId: program.id,
      maskedAccountNumber: '****-****-4321',
      coreBankingRef: 'CBS-RES-0001',
      accountName: 'Demo Trustee Reserve Account',
      bankLegalEntity: 'Demo Trustee Bank Ltd',
      currency: 'USD',
      classification: 'RESERVE_ACCOUNT',
      supportedAssetId: 'PUSD',
      status: 'ACTIVE',
      balanceSource: 'MANUAL',
      integrationMode: 'MANUAL_DUAL_CONTROL',
      requiredReserveBps: 10000,
      openedDate: new Date('2026-01-01T00:00:00.000Z'),
      agreementReference: 'TRUST-AGREEMENT-DEMO-001',
    },
  });

  // eslint-disable-next-line no-console
  console.log(
    `Seeded program ${program.code}, users ${maker.email} / ${checker.email}, ${FEATURE_FLAGS.length} feature flags, ${BUILTIN_ROLES.length} roles.`,
  );
  // eslint-disable-next-line no-console
  console.log('\n=== PILOT CLIENT CREDENTIALS (rotate for production, §27) ===');
  for (const s of issuedSecrets) {
    // eslint-disable-next-line no-console
    console.log(`  ${s.platform.padEnd(13)} client-id=${s.clientId}  client-secret=${s.secret}`);
  }
  // eslint-disable-next-line no-console
  console.log('\n=== SUPER ADMIN LOGIN (trustee.cambobia.com) — rotate for production ===');
  // eslint-disable-next-line no-console
  console.log(`  email:    ${superEmail}`);
  // eslint-disable-next-line no-console
  console.log(`  password: ${superPassword}`);
  // eslint-disable-next-line no-console
  console.log(`  2FA: ${superMfaState} — log in, then scan the QR shown in the console.\n`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
