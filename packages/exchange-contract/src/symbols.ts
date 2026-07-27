/**
 * CCXT unified symbol handling.
 *
 * CCXT identifies a market by a symbol string, not by our internal id:
 *
 *   spot          BTC/USDT
 *   linear perp   BTC/USDT:USDT
 *   inverse perp  BTC/USD:BTC
 *   dated future  BTC/USDT:USDT-251226
 *   option        BTC/USDT:USDT-251226-90000-C
 *
 * Getting this grammar exactly right is what makes an integration work on the
 * first attempt. It is small, fiddly, and entirely mechanical — so it lives
 * here, parsed and formatted in one place, and is tested to destruction.
 */

export interface ParsedSymbol {
  base: string;
  quote: string;
  /** Settlement asset — present on every contract market. */
  settle: string | null;
  /** YYMMDD expiry for dated contracts. */
  expiry: string | null;
  strike: string | null;
  optionType: 'call' | 'put' | null;
  type: 'spot' | 'swap' | 'future' | 'option';
  linear: boolean | null;
  inverse: boolean | null;
}

export class SymbolError extends Error {
  constructor(symbol: string, reason: string) {
    super(`Invalid market symbol "${symbol}": ${reason}`);
    this.name = 'SymbolError';
  }
}

const ASSET = /^[A-Z0-9]{2,16}$/;

export function parseSymbol(symbol: string): ParsedSymbol {
  if (typeof symbol !== 'string' || symbol.length === 0) throw new SymbolError(String(symbol), 'empty');

  const [pair, ...rest] = symbol.split(':');
  if (rest.length > 1) throw new SymbolError(symbol, 'more than one ":" separator');

  const pairParts = (pair ?? '').split('/');
  if (pairParts.length !== 2) throw new SymbolError(symbol, 'expected BASE/QUOTE');

  const [base, quote] = pairParts as [string, string];
  if (!ASSET.test(base)) throw new SymbolError(symbol, `base "${base}" is not a valid asset code`);
  if (!ASSET.test(quote)) throw new SymbolError(symbol, `quote "${quote}" is not a valid asset code`);

  // Spot: no settlement suffix at all.
  if (rest.length === 0) {
    return { base, quote, settle: null, expiry: null, strike: null, optionType: null, type: 'spot', linear: null, inverse: null };
  }

  const suffix = rest[0] ?? '';
  const [settle, expiry, strike, option] = suffix.split('-') as [string, string?, string?, string?];

  if (!ASSET.test(settle)) throw new SymbolError(symbol, `settle "${settle}" is not a valid asset code`);

  // A contract settling in its quote asset is linear; in its base asset, inverse.
  const linear = settle === quote;
  const inverse = settle === base;
  if (!linear && !inverse) throw new SymbolError(symbol, `settle "${settle}" must be either the base or the quote asset`);

  if (expiry === undefined) {
    return { base, quote, settle, expiry: null, strike: null, optionType: null, type: 'swap', linear, inverse };
  }

  if (!/^\d{6}$/.test(expiry)) throw new SymbolError(symbol, `expiry "${expiry}" must be YYMMDD`);

  if (strike === undefined) {
    return { base, quote, settle, expiry, strike: null, optionType: null, type: 'future', linear, inverse };
  }

  if (!/^\d+(\.\d+)?$/.test(strike)) throw new SymbolError(symbol, `strike "${strike}" must be numeric`);
  if (option !== 'C' && option !== 'P') throw new SymbolError(symbol, 'option type must be "C" or "P"');

  return {
    base,
    quote,
    settle,
    expiry,
    strike,
    optionType: option === 'C' ? 'call' : 'put',
    type: 'option',
    linear,
    inverse,
  };
}

export function formatSymbol(parsed: Omit<ParsedSymbol, 'linear' | 'inverse' | 'type'> & { type?: ParsedSymbol['type'] }): string {
  const pair = `${parsed.base}/${parsed.quote}`;
  if (!parsed.settle) return pair;

  let suffix = parsed.settle;
  if (parsed.expiry) suffix += `-${parsed.expiry}`;
  if (parsed.strike && parsed.optionType) suffix += `-${parsed.strike}-${parsed.optionType === 'call' ? 'C' : 'P'}`;

  return `${pair}:${suffix}`;
}

/** True when two symbols name the same market, whatever the spacing or case. */
export function symbolsEqual(a: string, b: string): boolean {
  try {
    return formatSymbol(parseSymbol(a.toUpperCase())) === formatSymbol(parseSymbol(b.toUpperCase()));
  } catch {
    return false;
  }
}
