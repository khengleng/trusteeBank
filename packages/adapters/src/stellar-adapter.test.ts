import { describe, it, expect } from 'vitest';
import { minorToStellarAmount, stellarAmountToMinor } from './stellar-adapter';

describe('stellar minor <-> amount conversion', () => {
  it('formats minor units to a Stellar decimal string', () => {
    expect(minorToStellarAmount(100_00n, 2)).toBe('100.00');
    expect(minorToStellarAmount(1n, 2)).toBe('0.01');
    expect(minorToStellarAmount(0n, 2)).toBe('0.00');
    expect(minorToStellarAmount(123456n, 4)).toBe('12.3456');
    expect(minorToStellarAmount(50n, 0)).toBe('50');
  });

  it('parses a Stellar 7-decimal amount back to minor units', () => {
    expect(stellarAmountToMinor('100.0000000', 2)).toBe(100_00n);
    expect(stellarAmountToMinor('0.0100000', 2)).toBe(1n);
    expect(stellarAmountToMinor('12.3456789', 4)).toBe(123456n); // truncates beyond decimals
    expect(stellarAmountToMinor('50', 0)).toBe(50n);
  });

  it('round-trips minor -> amount -> minor for pegged currencies', () => {
    for (const m of [0n, 1n, 99n, 100_00n, 999_999_99n]) {
      expect(stellarAmountToMinor(minorToStellarAmount(m, 2), 2)).toBe(m);
    }
  });

  it('rejects decimals beyond Stellar precision', () => {
    expect(() => minorToStellarAmount(1n, 8)).toThrow();
  });
});
