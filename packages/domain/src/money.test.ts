import { describe, it, expect } from 'vitest';
import {
  money,
  zero,
  add,
  subtract,
  sum,
  negate,
  compare,
  gte,
  gt,
  max,
  min,
  equals,
  isZero,
  isNegative,
  toJSON,
  fromJSON,
  CurrencyMismatchError,
} from './money';

describe('money', () => {
  it('constructs from bigint and number minor units', () => {
    expect(money(100n, 'usd').minor).toBe(100n);
    expect(money(100, 'usd').currency).toBe('USD');
  });

  it('rejects non-integer number minor units', () => {
    expect(() => money(1.5, 'USD')).toThrow();
  });

  it('adds and subtracts same currency', () => {
    expect(add(money(100n, 'USD'), money(50n, 'USD')).minor).toBe(150n);
    expect(subtract(money(100n, 'USD'), money(50n, 'USD')).minor).toBe(50n);
  });

  it('throws on currency mismatch', () => {
    expect(() => add(money(1n, 'USD'), money(1n, 'KHR'))).toThrow(
      CurrencyMismatchError,
    );
    expect(() => compare(money(1n, 'USD'), money(1n, 'KHR'))).toThrow(
      CurrencyMismatchError,
    );
  });

  it('sums a list', () => {
    expect(sum([money(1n, 'USD'), money(2n, 'USD'), money(3n, 'USD')]).minor).toBe(
      6n,
    );
  });

  it('throws summing empty list', () => {
    expect(() => sum([])).toThrow();
  });

  it('negates and detects sign', () => {
    expect(negate(money(5n, 'USD')).minor).toBe(-5n);
    expect(isNegative(money(-1n, 'USD'))).toBe(true);
    expect(isZero(zero('USD'))).toBe(true);
  });

  it('compares correctly', () => {
    expect(compare(money(1n, 'USD'), money(2n, 'USD'))).toBe(-1);
    expect(gte(money(2n, 'USD'), money(2n, 'USD'))).toBe(true);
    expect(gt(money(2n, 'USD'), money(2n, 'USD'))).toBe(false);
    expect(max(money(1n, 'USD'), money(2n, 'USD')).minor).toBe(2n);
    expect(min(money(1n, 'USD'), money(2n, 'USD')).minor).toBe(1n);
    expect(equals(money(1n, 'USD'), money(1n, 'USD'))).toBe(true);
  });

  it('round-trips through JSON without precision loss for large values', () => {
    const big = money(9_007_199_254_740_993n, 'USD'); // > Number.MAX_SAFE_INTEGER
    const restored = fromJSON(toJSON(big));
    expect(restored.minor).toBe(big.minor);
    expect(restored.currency).toBe('USD');
  });
});
