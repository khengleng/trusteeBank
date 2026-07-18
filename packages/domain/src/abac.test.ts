import { describe, it, expect } from 'vitest';
import { evaluateAbac, type AbacPolicyRule } from './abac';

function policy(p: Partial<AbacPolicyRule>): AbacPolicyRule {
  return {
    id: 'p', transactionType: 'MINT_AUTHORIZATION', minAmountMinor: null, maxAmountMinor: null,
    currency: null, riskLevel: null, programId: null, assetId: null, jurisdiction: null,
    requiredApprovals: 2, requiredRoles: [], effect: 'REQUIRE', priority: 100, enabled: true, ...p,
  };
}

describe('evaluateAbac', () => {
  it('defaults to maker-checker (2) when nothing matches', () => {
    const d = evaluateAbac([], { transactionType: 'MINT_AUTHORIZATION' });
    expect(d.requiredApprovals).toBe(2);
    expect(d.denied).toBe(false);
  });

  it('requires more approvals for high-value mints', () => {
    const d = evaluateAbac(
      [policy({ id: 'hv', minAmountMinor: 1_000_000_00n, requiredApprovals: 3, requiredRoles: ['treasury_checker'], priority: 200 })],
      { transactionType: 'MINT_AUTHORIZATION', amountMinor: 5_000_000_00n },
    );
    expect(d.requiredApprovals).toBe(3);
    expect(d.requiredRoles).toContain('treasury_checker');
    expect(d.matchedPolicyId).toBe('hv');
  });

  it('DENY overrides REQUIRE regardless of priority', () => {
    const d = evaluateAbac(
      [
        policy({ id: 'req', requiredApprovals: 2, priority: 300 }),
        policy({ id: 'deny', effect: 'DENY', priority: 10, jurisdiction: 'XX' }),
      ],
      { transactionType: 'MINT_AUTHORIZATION', jurisdiction: 'XX' },
    );
    expect(d.denied).toBe(true);
    expect(d.matchedPolicyId).toBe('deny');
  });

  it('does not match a policy for a different transaction type', () => {
    const d = evaluateAbac(
      [policy({ transactionType: 'PAYOUT', requiredApprovals: 4 })],
      { transactionType: 'MINT_AUTHORIZATION' },
    );
    expect(d.requiredApprovals).toBe(2);
  });
});
