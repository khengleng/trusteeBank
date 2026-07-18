"use strict";
/**
 * Money handling for the Trustee Fund Platform.
 *
 * All monetary values are represented as integer minor units (e.g. cents, sen)
 * using `bigint`. Floating point is never used for money in this platform.
 * A `Money` value is always paired with an ISO-4217 currency code; operations
 * across differing currencies throw rather than silently coerce.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrencyMismatchError = void 0;
exports.money = money;
exports.zero = zero;
exports.add = add;
exports.subtract = subtract;
exports.sum = sum;
exports.negate = negate;
exports.isZero = isZero;
exports.isNegative = isNegative;
exports.isPositive = isPositive;
exports.compare = compare;
exports.gte = gte;
exports.gt = gt;
exports.max = max;
exports.min = min;
exports.equals = equals;
exports.toJSON = toJSON;
exports.fromJSON = fromJSON;
class CurrencyMismatchError extends Error {
    constructor(a, b) {
        super(`Currency mismatch: ${a} vs ${b}`);
        this.name = 'CurrencyMismatchError';
    }
}
exports.CurrencyMismatchError = CurrencyMismatchError;
function money(minor, currency) {
    const value = typeof minor === 'number' ? BigInt(Math.trunc(minor)) : minor;
    if (typeof minor === 'number' && !Number.isInteger(minor)) {
        throw new Error(`Money minor units must be integers, received ${minor}`);
    }
    return { minor: value, currency: currency.toUpperCase() };
}
function zero(currency) {
    return { minor: 0n, currency: currency.toUpperCase() };
}
function assertSameCurrency(a, b) {
    if (a.currency !== b.currency) {
        throw new CurrencyMismatchError(a.currency, b.currency);
    }
}
function add(a, b) {
    assertSameCurrency(a, b);
    return { minor: a.minor + b.minor, currency: a.currency };
}
function subtract(a, b) {
    assertSameCurrency(a, b);
    return { minor: a.minor - b.minor, currency: a.currency };
}
/** Sum a list of Money values. Throws on empty list (no currency to infer). */
function sum(values) {
    const first = values[0];
    if (first === undefined) {
        throw new Error('Cannot sum an empty list of Money without a currency');
    }
    return values.slice(1).reduce((acc, m) => add(acc, m), first);
}
function negate(a) {
    return { minor: -a.minor, currency: a.currency };
}
function isZero(a) {
    return a.minor === 0n;
}
function isNegative(a) {
    return a.minor < 0n;
}
function isPositive(a) {
    return a.minor > 0n;
}
/** Returns -1, 0 or 1 comparing a to b. */
function compare(a, b) {
    assertSameCurrency(a, b);
    if (a.minor < b.minor)
        return -1;
    if (a.minor > b.minor)
        return 1;
    return 0;
}
function gte(a, b) {
    return compare(a, b) >= 0;
}
function gt(a, b) {
    return compare(a, b) > 0;
}
function max(a, b) {
    return gte(a, b) ? a : b;
}
function min(a, b) {
    return gte(a, b) ? b : a;
}
function equals(a, b) {
    return a.currency === b.currency && a.minor === b.minor;
}
/** Serialize to a stable JSON-safe representation (bigint as decimal string). */
function toJSON(a) {
    return { minor: a.minor.toString(), currency: a.currency };
}
function fromJSON(v) {
    return { minor: BigInt(v.minor), currency: v.currency.toUpperCase() };
}
//# sourceMappingURL=money.js.map