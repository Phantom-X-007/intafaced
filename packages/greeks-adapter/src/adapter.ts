/**
 * QuantLib adapter — PTX-M11 Greeks/calendars.
 *
 * When INTAFACED_QUANTLIB_NATIVE names a QuantLib 1.43 addon, NPV/Greeks/year-fraction
 * come from QuantLib and leave as decimal strings. Blank env unlinks. Every unlinked
 * call refuses and does not invent Black-Scholes. Ledger clock and live mark stay outside.
 */

import { readDecimalString, readIsoDate, VANILLA_FIELDS } from './decimal.js';
import { IeeeNonFiniteError, ieeeFloat64ToDecimalString } from './ieee-decimal.js';
import { loadNativeQuantLib } from './native.js';
import type {
  AdapterRefuse,
  DayCountConvention,
  DayCountInput,
  DayCountResult,
  GreeksAdapter,
  NativeQuantLib,
  OptionRight,
  VanillaEuropeanInput,
  VanillaEuropeanResult,
} from './types.js';
import { DAY_COUNT_CONVENTIONS } from './types.js';

const UNLINKED =
  'QuantLib C++ 1.43 is not linked — blank INTAFACED_QUANTLIB_NATIVE unlinks; refusing rather than inventing Greeks';

function refuse(linked: boolean, reason: AdapterRefuse['reason'], message: string, field?: string): AdapterRefuse {
  return field === undefined ? { ok: false, linked, reason, message } : { ok: false, linked, reason, field, message };
}

function readRight(
  value: unknown,
): { ok: true; value: OptionRight } | { ok: false; reason: AdapterRefuse['reason']; message: string; field: string } {
  if (value === undefined || value === null || value === '') {
    return { ok: false, reason: 'missing_input', message: 'right is missing', field: 'right' };
  }
  if (value !== 'call' && value !== 'put') {
    return { ok: false, reason: 'invalid_right', message: 'right must be "call" or "put"', field: 'right' };
  }
  return { ok: true, value };
}

function readConvention(
  value: unknown,
): { ok: true; value: DayCountConvention } | { ok: false; reason: AdapterRefuse['reason']; message: string; field: string } {
  if (value === undefined || value === null || value === '') {
    return { ok: false, reason: 'missing_input', message: 'convention is missing', field: 'convention' };
  }
  if (!(DAY_COUNT_CONVENTIONS as readonly string[]).includes(value as string)) {
    return {
      ok: false,
      reason: 'invalid_convention',
      message: `convention must be one of ${DAY_COUNT_CONVENTIONS.join(', ')}`,
      field: 'convention',
    };
  }
  return { ok: true, value: value as DayCountConvention };
}

export function createGreeksAdapter(deps: { readonly native?: NativeQuantLib | null } = {}): GreeksAdapter {
  const native = deps.native === undefined ? loadNativeQuantLib() : deps.native;
  const linked = native !== null;

  return {
    linked,
    vanillaEuropean(input: Partial<VanillaEuropeanInput> | null | undefined): VanillaEuropeanResult {
      const right = readRight(input?.right);
      if (!right.ok) return refuse(linked, right.reason, right.message, right.field);

      const fields: Record<(typeof VANILLA_FIELDS)[number], string> = {
        strike: '',
        spot: '',
        volatility: '',
        timeToExpiry: '',
        riskFreeRate: '',
        dividendYield: '',
      };
      for (const field of VANILLA_FIELDS) {
        const read = readDecimalString(input?.[field], field);
        if (!read.ok) return refuse(linked, read.reason, read.message, field);
        fields[field] = read.value;
      }

      if (native === null) {
        return refuse(linked, 'native_unavailable', UNLINKED);
      }

      let ieee;
      try {
        ieee = native.vanillaEuropean({
          right: right.value,
          strike: fields.strike,
          spot: fields.spot,
          volatility: fields.volatility,
          timeToExpiry: fields.timeToExpiry,
          riskFreeRate: fields.riskFreeRate,
          dividendYield: fields.dividendYield,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'QuantLib native call failed';
        return refuse(linked, 'native_error', message);
      }

      try {
        return {
          ok: true,
          linked: true,
          npv: ieeeFloat64ToDecimalString(ieee.npv),
          delta: ieeeFloat64ToDecimalString(ieee.delta),
          gamma: ieeeFloat64ToDecimalString(ieee.gamma),
          vega: ieeeFloat64ToDecimalString(ieee.vega),
          theta: ieeeFloat64ToDecimalString(ieee.theta),
        };
      } catch (err) {
        if (err instanceof IeeeNonFiniteError) {
          return refuse(linked, 'non_finite_native', err.message);
        }
        throw err;
      }
    },
    yearFraction(input: Partial<DayCountInput> | null | undefined): DayCountResult {
      const convention = readConvention(input?.convention);
      if (!convention.ok) return refuse(linked, convention.reason, convention.message, convention.field);

      const start = readIsoDate(input?.start, 'start');
      if (!start.ok) return refuse(linked, start.reason, start.message, 'start');
      const end = readIsoDate(input?.end, 'end');
      if (!end.ok) return refuse(linked, end.reason, end.message, 'end');

      if (native === null) {
        return refuse(linked, 'native_unavailable', UNLINKED);
      }

      let ieee: number;
      try {
        ieee = native.yearFraction({ convention: convention.value, start: start.value, end: end.value });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'QuantLib native call failed';
        return refuse(linked, 'native_error', message);
      }

      try {
        return { ok: true, linked: true, yearFraction: ieeeFloat64ToDecimalString(ieee) };
      } catch (err) {
        if (err instanceof IeeeNonFiniteError) {
          return refuse(linked, 'non_finite_native', err.message);
        }
        throw err;
      }
    },
  };
}

export const greeksAdapter = createGreeksAdapter();
