/**
 * Environment-based configuration with strict startup validation (domain config
 * doc). Domains are never hard-coded in business logic — they are read here and
 * validated at boot. Missing required variables fail fast.
 */

export interface PlatformConfig {
  nodeEnv: string;
  port: number;
  branding: { productName: string; subtitle: string };
  urls: {
    trusteePublic: string;
    trusteeApi: string;
    trusteeOps: string;
    trusteeTreasury: string;
    trusteeCompliance: string;
    trusteeAudit: string;
    paychainPublic: string;
    paychainApi: string;
    paykhPublic: string;
    paykhApi: string;
  };
  corsAllowedOrigins: string[];
  callbacks: { paychain: string; paykh: string };
  swaggerEnabled: boolean;
}

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

export function loadConfig(): PlatformConfig {
  const trusteePublic = req('TRUSTEE_PUBLIC_URL', 'https://trustee.cambobia.com');
  const trusteeApi = req('TRUSTEE_API_URL', 'https://api.trustee.cambobia.com');
  const trusteeOps = req('TRUSTEE_OPS_URL', 'https://ops.trustee.cambobia.com');
  const trusteeTreasury = req('TRUSTEE_TREASURY_URL', 'https://treasury.trustee.cambobia.com');
  const trusteeCompliance = req('TRUSTEE_COMPLIANCE_URL', 'https://compliance.trustee.cambobia.com');
  const trusteeAudit = req('TRUSTEE_AUDIT_URL', 'https://audit.trustee.cambobia.com');
  const paychainPublic = req('PAYCHAIN_PUBLIC_URL', 'https://paychain.cambobia.com');
  const paychainApi = req('PAYCHAIN_API_URL', 'https://api.paychain.cambobia.com');
  const paykhPublic = req('PAYKH_PUBLIC_URL', 'https://paykh.cambobia.com');
  const paykhApi = req('PAYKH_API_URL', 'https://api.paykh.cambobia.com');

  // CORS: only approved origins; never wildcard for financial APIs (domain config).
  const corsAllowedOrigins = (
    process.env.CORS_ALLOWED_ORIGINS ??
    [
      trusteePublic,
      trusteeOps,
      trusteeTreasury,
      trusteeCompliance,
      trusteeAudit,
      paychainPublic,
      paykhPublic,
    ].join(',')
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
    branding: {
      productName: 'Cambobia Trustee Banking Platform',
      subtitle: 'Safeguarding, reserve control and financial assurance for PayChain and PayKH',
    },
    urls: {
      trusteePublic,
      trusteeApi,
      trusteeOps,
      trusteeTreasury,
      trusteeCompliance,
      trusteeAudit,
      paychainPublic,
      paychainApi,
      paykhPublic,
      paykhApi,
    },
    corsAllowedOrigins,
    callbacks: {
      paychain: `${paychainApi}/api/v1/trustee/events`,
      paykh: `${paykhApi}/api/v1/trustee/events`,
    },
    swaggerEnabled: (process.env.SWAGGER_ENABLED ?? 'true') === 'true',
  };
}
