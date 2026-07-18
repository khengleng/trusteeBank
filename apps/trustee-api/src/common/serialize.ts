import type { Money } from '@trustee/domain';

/** Serialize a Money value to a JSON-safe shape (bigint -> decimal string). */
export function money(m: Money): { minor: string; currency: string } {
  return { minor: m.minor.toString(), currency: m.currency };
}

/** Serialize a bigint to a decimal string. */
export function big(v: bigint): string {
  return v.toString();
}
