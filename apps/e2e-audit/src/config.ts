/** Environment configuration for the E2E audit harness. Secrets via env only. */
export interface AuditConfig {
  trusteeBase: string;
  paychainBase: string;
  paykhBase: string;
  // Trustee client credentials per namespace (client separation).
  trusteeBankId: string;
  trusteeBankSecret: string;
  paychainId: string;
  paychainSecret: string;
  paykhId: string;
  paykhSecret: string;
  // Test subject context.
  programId: string;
  loyaltyLiabilityId: string;
  stellarHorizon: string;
  // Where the evidence pack is written.
  outDir: string;
}

export function loadConfig(): AuditConfig {
  const e = process.env;
  return {
    trusteeBase: e.TRUSTEE_API_URL ?? 'http://127.0.0.1:3999',
    paychainBase: e.PAYCHAIN_API_URL ?? '',
    paykhBase: e.PAYKH_API_URL ?? '',
    trusteeBankId: e.TRUSTEE_BANK_CLIENT_ID ?? '',
    trusteeBankSecret: e.TRUSTEE_BANK_CLIENT_SECRET ?? '',
    paychainId: e.PAYCHAIN_CLIENT_ID ?? '',
    paychainSecret: e.PAYCHAIN_CLIENT_SECRET ?? '',
    paykhId: e.PAYKH_CLIENT_ID ?? '',
    paykhSecret: e.PAYKH_CLIENT_SECRET ?? '',
    programId: e.E2E_PROGRAM_ID ?? '',
    loyaltyLiabilityId: e.E2E_LOYALTY_LIABILITY_ID ?? '',
    stellarHorizon: e.STELLAR_HORIZON_URL ?? 'https://horizon-testnet.stellar.org',
    outDir: e.E2E_OUT_DIR ?? '',
  };
}
