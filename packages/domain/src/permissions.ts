/**
 * Permission catalog and roles for trustee-bank operations (§8). Permissions are
 * fine-grained capability slugs; roles bundle them. The admin portal manages the
 * mapping (RBAC), while ABAC policies add attribute conditions on top (§9).
 */

export const Permission = {
  // Account & program registry
  ACCOUNT_REGISTER: 'account.register',
  ACCOUNT_ACTIVATE: 'account.activate',
  ACCOUNT_CLOSE: 'account.close',
  PROGRAM_MANAGE: 'program.manage',
  REGISTRY_MANAGE: 'registry.manage',
  // Deposits & funding
  DEPOSIT_VIEW: 'deposit.view',
  DEPOSIT_MATCH: 'deposit.match',
  DEPOSIT_CLEAR: 'deposit.clear',
  FUNDING_CREATE: 'funding.create',
  // Reserve & mint
  RESERVE_VIEW: 'reserve.view',
  MINT_REQUEST: 'mint.request', // maker
  MINT_APPROVE: 'mint.approve', // checker
  MINT_REVOKE: 'mint.revoke',
  // Redemption & payout
  REDEMPTION_APPROVE: 'redemption.approve',
  PAYOUT_APPROVE: 'payout.approve',
  // PayKH
  PAYKH_PROFILE_VERIFY: 'paykh.profile.verify',
  PAYKH_SETTLEMENT_APPROVE: 'paykh.settlement.approve',
  // Compliance
  COMPLIANCE_REVIEW: 'compliance.review',
  COMPLIANCE_HOLD: 'compliance.hold',
  // Proof of reserve / attestation
  POR_GENERATE: 'por.generate',
  ATTESTATION_APPROVE: 'attestation.approve',
  // Admin / governance
  ADMIN_USERS: 'admin.users',
  ADMIN_ROLES: 'admin.roles',
  ADMIN_POLICIES: 'admin.policies',
  ADMIN_FEATURE_FLAGS: 'admin.feature-flags',
  ADMIN_EMERGENCY: 'admin.emergency',
  // Read-only
  AUDIT_VIEW: 'audit.view',
  EXECUTIVE_VIEW: 'executive.view',
} as const;
export type Permission = (typeof Permission)[keyof typeof Permission];

export const ALL_PERMISSIONS: readonly Permission[] = Object.values(Permission);

/** Built-in trustee-bank roles (§8) with default permission bundles. */
export interface RoleDefinition {
  slug: string;
  name: string;
  institution: string;
  permissions: Permission[];
}

export const BUILTIN_ROLES: readonly RoleDefinition[] = [
  {
    slug: 'trustee_super_admin',
    name: 'Trustee Bank Super Administrator',
    institution: 'TRUSTEE_BANK',
    permissions: [...ALL_PERMISSIONS],
  },
  {
    slug: 'trustee_operations_maker',
    name: 'Trustee Operations Maker',
    institution: 'TRUSTEE_BANK',
    permissions: [
      Permission.DEPOSIT_VIEW,
      Permission.DEPOSIT_MATCH,
      Permission.FUNDING_CREATE,
      Permission.RESERVE_VIEW,
      Permission.MINT_REQUEST,
    ],
  },
  {
    slug: 'trustee_operations_checker',
    name: 'Trustee Operations Checker',
    institution: 'TRUSTEE_BANK',
    permissions: [
      Permission.DEPOSIT_VIEW,
      Permission.DEPOSIT_CLEAR,
      Permission.RESERVE_VIEW,
      Permission.MINT_APPROVE,
      Permission.MINT_REVOKE,
    ],
  },
  {
    slug: 'treasury_maker',
    name: 'Treasury Maker',
    institution: 'TRUSTEE_BANK',
    permissions: [Permission.RESERVE_VIEW, Permission.POR_GENERATE],
  },
  {
    slug: 'treasury_checker',
    name: 'Treasury Checker',
    institution: 'TRUSTEE_BANK',
    permissions: [Permission.RESERVE_VIEW, Permission.PAYOUT_APPROVE, Permission.REDEMPTION_APPROVE],
  },
  {
    slug: 'compliance_analyst',
    name: 'Compliance Analyst',
    institution: 'TRUSTEE_BANK',
    permissions: [Permission.COMPLIANCE_REVIEW],
  },
  {
    slug: 'compliance_approver',
    name: 'Compliance Approver',
    institution: 'TRUSTEE_BANK',
    permissions: [Permission.COMPLIANCE_REVIEW, Permission.COMPLIANCE_HOLD],
  },
  {
    slug: 'internal_auditor',
    name: 'Internal Auditor',
    institution: 'TRUSTEE_BANK',
    permissions: [Permission.AUDIT_VIEW, Permission.RESERVE_VIEW, Permission.EXECUTIVE_VIEW],
  },
  {
    slug: 'security_admin',
    name: 'Security Administrator',
    institution: 'TRUSTEE_BANK',
    permissions: [Permission.ADMIN_USERS, Permission.ADMIN_ROLES, Permission.ADMIN_EMERGENCY],
  },
  {
    slug: 'readonly_executive',
    name: 'Read-only Executive',
    institution: 'TRUSTEE_BANK',
    permissions: [Permission.EXECUTIVE_VIEW, Permission.RESERVE_VIEW],
  },
];

/** True if the union of the given roles' permissions includes `permission`. */
export function roleSetHasPermission(
  roleDefs: readonly { permissions: readonly string[] }[],
  permission: Permission,
): boolean {
  return roleDefs.some((r) => r.permissions.includes(permission));
}
