/**
 * Money handling for the Trustee Fund Platform.
 *
 * All monetary values are represented as integer minor units (e.g. cents, sen)
 * using `bigint`. Floating point is never used for money in this platform.
 * A `Money` value is always paired with an ISO-4217 currency code; operations
 * across differing currencies throw rather than silently coerce.
 */

export type CurrencyCode = string; // ISO-4217, e.g. "USD", "KHR"

export interface Money {
  /** Amount in minor units (integer). Positive, negative or zero. */
  readonly minor: bigint;
  /** ISO-4217 currency code, uppercased. */
  readonly currency: CurrencyCode;
}

export class CurrencyMismatchError extends Error {
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(`Currency mismatch: ${a} vs ${b}`);
    this.name = 'CurrencyMismatchError';
  }
}

export function money(minor: bigint | number, currency: CurrencyCode): Money {
  const value = typeof minor === 'number' ? BigInt(Math.trunc(minor)) : minor;
  if (typeof minor === 'number' && !Number.isInteger(minor)) {
    throw new Error(`Money minor units must be integers, received ${minor}`);
  }
  return { minor: value, currency: currency.toUpperCase() };
}

export function zero(currency: CurrencyCode): Money {
  return { minor: 0n, currency: currency.toUpperCase() };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new CurrencyMismatchError(a.currency, b.currency);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { minor: a.minor + b.minor, currency: a.currency };
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { minor: a.minor - b.minor, currency: a.currency };
}

/** Sum a list of Money values. Throws on empty list (no currency to infer). */
export function sum(values: readonly Money[]): Money {
  const first = values[0];
  if (first === undefined) {
    throw new Error('Cannot sum an empty list of Money without a currency');
  }
  return values.slice(1).reduce((acc, m) => add(acc, m), first);
}

export function negate(a: Money): Money {
  return { minor: -a.minor, currency: a.currency };
}

export function isZero(a: Money): boolean {
  return a.minor === 0n;
}

export function isNegative(a: Money): boolean {
  return a.minor < 0n;
}

export function isPositive(a: Money): boolean {
  return a.minor > 0n;
}

/** Returns -1, 0 or 1 comparing a to b. */
export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  if (a.minor < b.minor) return -1;
  if (a.minor > b.minor) return 1;
  return 0;
}

export function gte(a: Money, b: Money): boolean {
  return compare(a, b) >= 0;
}

export function gt(a: Money, b: Money): boolean {
  return compare(a, b) > 0;
}

export function max(a: Money, b: Money): Money {
  return gte(a, b) ? a : b;
}

export function min(a: Money, b: Money): Money {
  return gte(a, b) ? b : a;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.minor === b.minor;
}

/** Serialize to a stable JSON-safe representation (bigint as decimal string). */
export function toJSON(a: Money): { minor: string; currency: CurrencyCode } {
  return { minor: a.minor.toString(), currency: a.currency };
}

export function fromJSON(v: { minor: string; currency: CurrencyCode }): Money {
  return { minor: BigInt(v.minor), currency: v.currency.toUpperCase() };
}
