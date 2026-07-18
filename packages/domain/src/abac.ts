/**
 * Attribute-based access control evaluation for approval matrices (§9). Given a
 * transaction's attributes and the configured policies, decide how many
 * approvals are required, from which roles, or whether the action is denied.
 *
 * Pure and deterministic — the admin service supplies the policies, the domain
 * decides. Highest-priority matching policy wins; DENY always blocks.
 */

export interface AbacTransaction {
  transactionType: string;
  amountMinor?: bigint;
  currency?: string;
  riskLevel?: string;
  programId?: string;
  assetId?: string;
  jurisdiction?: string;
}

export interface AbacPolicyRule {
  id: string;
  transactionType: string;
  minAmountMinor: bigint | null;
  maxAmountMinor: bigint | null;
  currency: string | null;
  riskLevel: string | null;
  programId: string | null;
  assetId: string | null;
  jurisdiction: string | null;
  requiredApprovals: number;
  requiredRoles: string[];
  effect: string; // REQUIRE | DENY
  priority: number;
  enabled: boolean;
}

export interface AbacDecision {
  denied: boolean;
  requiredApprovals: number;
  requiredRoles: string[];
  matchedPolicyId: string | null;
}

function matches(policy: AbacPolicyRule, tx: AbacTransaction): boolean {
  if (!policy.enabled) return false;
  if (policy.transactionType !== tx.transactionType) return false;
  if (policy.currency && policy.currency !== tx.currency) return false;
  if (policy.riskLevel && policy.riskLevel !== tx.riskLevel) return false;
  if (policy.programId && policy.programId !== tx.programId) return false;
  if (policy.assetId && policy.assetId !== tx.assetId) return false;
  if (policy.jurisdiction && policy.jurisdiction !== tx.jurisdiction) return false;
  const amt = tx.amountMinor;
  if (policy.minAmountMinor !== null) {
    if (amt === undefined || amt < policy.minAmountMinor) return false;
  }
  if (policy.maxAmountMinor !== null) {
    if (amt === undefined || amt > policy.maxAmountMinor) return false;
  }
  return true;
}

/**
 * Evaluate policies for a transaction. Default when nothing matches: two
 * approvals (maker-checker), no role restriction — the platform-wide §9 default.
 */
export function evaluateAbac(
  policies: readonly AbacPolicyRule[],
  tx: AbacTransaction,
): AbacDecision {
  const matched = policies
    .filter((p) => matches(p, tx))
    .sort((a, b) => b.priority - a.priority);

  const deny = matched.find((p) => p.effect === 'DENY');
  if (deny) {
    return { denied: true, requiredApprovals: 0, requiredRoles: [], matchedPolicyId: deny.id };
  }
  const require = matched.find((p) => p.effect === 'REQUIRE');
  if (require) {
    return {
      denied: false,
      requiredApprovals: require.requiredApprovals,
      requiredRoles: require.requiredRoles,
      matchedPolicyId: require.id,
    };
  }
  return { denied: false, requiredApprovals: 2, requiredRoles: [], matchedPolicyId: null };
}
