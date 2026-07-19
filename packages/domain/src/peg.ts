/**
 * Currency peg & denomination (update §24).
 *
 * A backed token declares the fiat currency it is pegged to (`pegCurrency`) and
 * a `denominationMinor` — the number of minor units of the peg currency that
 * back exactly one whole token unit. For a pure 1:1 stablecoin where one token
 * minor unit equals one currency minor unit, `denominationMinor` is 1. For a
 * face-value token (e.g. a 5,000 KHR voucher token), it is the face value in
 * minor units, so issuing N tokens requires N × denominationMinor of backing.
 *
 * The peg currency is always the reserve/backing currency — this platform never
 * mixes currencies inside one reserve calculation, so there is no FX here.
 */

import { money, type CurrencyCode, type Money } from './money';

export interface Peg {
  readonly pegCurrency: CurrencyCode;
  /** Minor units of peg currency backing one whole token unit (>= 1). */
  readonly denominationMinor: bigint;
}

export function makePeg(pegCurrency: CurrencyCode, denominationMinor: bigint): Peg {
  if (denominationMinor <= 0n) {
    throw new Error('Peg denomination must be positive');
  }
  return { pegCurrency: pegCurrency.toUpperCase(), denominationMinor };
}

/** Backing (in peg currency) required to issue `units` whole token units. */
export function backingForUnits(units: bigint, peg: Peg): Money {
  if (units < 0n) throw new Error('Token units cannot be negative');
  return money(units * peg.denominationMinor, peg.pegCurrency);
}

/** Whole token units represented by a backing amount, or null if it is not a
 * whole multiple of the denomination (denominations must divide evenly). */
export function unitsForBacking(backing: Money, peg: Peg): bigint | null {
  if (backing.currency !== peg.pegCurrency) {
    throw new Error(
      `Backing currency ${backing.currency} does not match peg currency ${peg.pegCurrency}`,
    );
  }
  if (backing.minor % peg.denominationMinor !== 0n) return null;
  return backing.minor / peg.denominationMinor;
}
