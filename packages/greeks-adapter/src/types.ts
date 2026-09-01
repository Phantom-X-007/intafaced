/**
 * Public wire types for the QuantLib Greeks/calendar adapter.
 *
 * NPV/Greeks/year-fraction cross this boundary as decimal strings only.
 * IEEE from QuantLib is converted before return. This package is not a book
 * and is not live-mark SoT. Ledger clock stays with the caller.
 */

/** Decimal string on the wire — no exponent, no IEEE `number`. */
export type DecimalString = string;

export type OptionRight = 'call' | 'put';

/** QuantLib day-count names we will ask the native library for. */
export const DAY_COUNT_CONVENTIONS = ['Actual365Fixed', 'Actual360', 'Thirty360', 'ActualActual'] as const;

export type DayCountConvention = (typeof DAY_COUNT_CONVENTIONS)[number];

export type VanillaEuropeanInput = {
  readonly right: OptionRight;
  readonly strike: DecimalString;
  readonly spot: DecimalString;
  readonly volatility: DecimalString;
  /** Year fraction from OUR clock, already computed by the caller. */
  readonly timeToExpiry: DecimalString;
  readonly riskFreeRate: DecimalString;
  readonly dividendYield: DecimalString;
};

export type GreeksOk = {
  readonly ok: true;
  readonly linked: true;
  readonly npv: DecimalString;
  readonly delta: DecimalString;
  readonly gamma: DecimalString;
  readonly vega: DecimalString;
  readonly theta: DecimalString;
};

export type AdapterRefuseReason =
  | 'native_unavailable'
  | 'missing_input'
  | 'invalid_decimal'
  | 'ieee_input'
  | 'invalid_right'
  | 'invalid_convention'
  | 'invalid_date'
  | 'non_finite_native'
  | 'native_error';

export type AdapterRefuse = {
  readonly ok: false;
  readonly linked: boolean;
  readonly reason: AdapterRefuseReason;
  readonly field?: string;
  readonly message: string;
};

export type VanillaEuropeanResult = GreeksOk | AdapterRefuse;

export type DayCountInput = {
  readonly convention: DayCountConvention;
  readonly start: string;
  readonly end: string;
};

export type DayCountOk = {
  readonly ok: true;
  readonly linked: true;
  readonly yearFraction: DecimalString;
};

export type DayCountResult = DayCountOk | AdapterRefuse;

/** IEEE values that exist only inside the native QuantLib FFI, never on the public wire. */
export type NativeIeeeGreeks = {
  readonly npv: number;
  readonly delta: number;
  readonly gamma: number;
  readonly vega: number;
  readonly theta: number;
};

export type NativeVanillaArgs = {
  readonly right: OptionRight;
  readonly strike: DecimalString;
  readonly spot: DecimalString;
  readonly volatility: DecimalString;
  readonly timeToExpiry: DecimalString;
  readonly riskFreeRate: DecimalString;
  readonly dividendYield: DecimalString;
};

export type NativeDayCountArgs = {
  readonly convention: DayCountConvention;
  readonly start: string;
  readonly end: string;
};

export type NativeQuantLib = {
  readonly vanillaEuropean: (input: NativeVanillaArgs) => NativeIeeeGreeks;
  readonly yearFraction: (input: NativeDayCountArgs) => number;
};

export type GreeksAdapter = {
  readonly linked: boolean;
  vanillaEuropean(input: Partial<VanillaEuropeanInput> | null | undefined): VanillaEuropeanResult;
  yearFraction(input: Partial<DayCountInput> | null | undefined): DayCountResult;
};
