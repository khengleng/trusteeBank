/**
 * Money handling for the Trustee Fund Platform.
 *
 * All monetary values are represented as integer minor units (e.g. cents, sen)
 * using `bigint`. Floating point is never used for money in this platform.
 * A `Money` value is always paired with an ISO-4217 currency code; operations
 * across differing currencies throw rather than silently coerce.
 */
export type CurrencyCode = string;
export interface Money {
    /** Amount in minor units (integer). Positive, negative or zero. */
    readonly minor: bigint;
    /** ISO-4217 currency code, uppercased. */
    readonly currency: CurrencyCode;
}
export declare class CurrencyMismatchError extends Error {
    constructor(a: CurrencyCode, b: CurrencyCode);
}
export declare function money(minor: bigint | number, currency: CurrencyCode): Money;
export declare function zero(currency: CurrencyCode): Money;
export declare function add(a: Money, b: Money): Money;
export declare function subtract(a: Money, b: Money): Money;
/** Sum a list of Money values. Throws on empty list (no currency to infer). */
export declare function sum(values: readonly Money[]): Money;
export declare function negate(a: Money): Money;
export declare function isZero(a: Money): boolean;
export declare function isNegative(a: Money): boolean;
export declare function isPositive(a: Money): boolean;
/** Returns -1, 0 or 1 comparing a to b. */
export declare function compare(a: Money, b: Money): -1 | 0 | 1;
export declare function gte(a: Money, b: Money): boolean;
export declare function gt(a: Money, b: Money): boolean;
export declare function max(a: Money, b: Money): Money;
export declare function min(a: Money, b: Money): Money;
export declare function equals(a: Money, b: Money): boolean;
/** Serialize to a stable JSON-safe representation (bigint as decimal string). */
export declare function toJSON(a: Money): {
    minor: string;
    currency: CurrencyCode;
};
export declare function fromJSON(v: {
    minor: string;
    currency: CurrencyCode;
}): Money;
//# sourceMappingURL=money.d.ts.map