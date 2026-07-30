import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { MAX_DECIMALS, MAX_WHOLE_SUPPLY, parseTokenParams, TokenParamsError } from './params.js';

/**
 * LAUNCH POLICY — the refusals, and the arithmetic that must not round.
 *
 * A token's parameters are immutable the instant the deployment lands. There is
 * no correcting a supply, a symbol or a decimals afterwards; there is only
 * refusing before. So every case here is either "this is refused, with a code a
 * creator can act on" or "this scales to exactly this bigint, and nothing was
 * lost on the way".
 */

const RECIPIENT: Address = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const base = { name: 'Sovereign One', symbol: 'SOV', decimals: 18, totalSupply: '1000000', recipient: RECIPIENT };

/** The code, not just "it threw". A message a caller cannot branch on is not a contract. */
function refusalCode(input: Parameters<typeof parseTokenParams>[0]): string {
  try {
    parseTokenParams(input);
  } catch (err) {
    if (err instanceof TokenParamsError) return err.code;
    throw err;
  }
  throw new Error('expected a refusal, got a parsed result');
}

describe('supply scaling — never through a number', () => {
  it('scales whole tokens by decimals exactly', () => {
    expect(parseTokenParams({ ...base, decimals: 18, totalSupply: '1000000' }).totalSupply).toBe(10n ** 24n);
    expect(parseTokenParams({ ...base, decimals: 6, totalSupply: '1000000' }).totalSupply).toBe(1_000_000_000_000n);
    expect(parseTokenParams({ ...base, decimals: 0, totalSupply: '21000000' }).totalSupply).toBe(21_000_000n);
  });

  it('scales a fractional supply without losing the fraction', () => {
    expect(parseTokenParams({ ...base, decimals: 6, totalSupply: '1234.567891' }).totalSupply).toBe(1_234_567_891n);
    expect(parseTokenParams({ ...base, decimals: 2, totalSupply: '0.01' }).totalSupply).toBe(1n);
  });

  /**
   * THE ONE THAT WOULD BE SILENT.
   *
   * 99999999999999999999 is past `Number.MAX_SAFE_INTEGER` by four orders of
   * magnitude. Had this value gone anywhere near a JS number — a `z.number()`
   * on the wire, a `parseFloat` in a form handler, a `Number()` in a validator —
   * it would arrive rounded, and the creator's token would be permanently wrong
   * with no way to fix it and nothing in the logs to explain it.
   */
  it('carries a supply far beyond Number.MAX_SAFE_INTEGER intact', () => {
    const parsed = parseTokenParams({ ...base, decimals: 18, totalSupply: '99999999999999999999' });
    expect(parsed.totalSupply).toBe(99_999_999_999_999_999_999n * 10n ** 18n);
    // The proof that a number round-trip would have destroyed it.
    expect(BigInt(Number('99999999999999999999'))).not.toBe(99_999_999_999_999_999_999n);
  });

  it('refuses more decimal places than the token has, rather than truncating', () => {
    // 1.5 at 0 decimals is 1 or 2, and both are wrong. Neither is chosen.
    expect(refusalCode({ ...base, decimals: 0, totalSupply: '1.5' })).toBe('launch.invalid_supply');
    expect(refusalCode({ ...base, decimals: 6, totalSupply: '1.1234567' })).toBe('launch.invalid_supply');
  });

  it('refuses a supply that scales to zero', () => {
    expect(refusalCode({ ...base, totalSupply: '0' })).toBe('launch.invalid_supply');
    expect(refusalCode({ ...base, decimals: 2, totalSupply: '0.00' })).toBe('launch.invalid_supply');
  });

  it('refuses anything that is not a plain decimal string', () => {
    for (const totalSupply of ['1e21', '-100', '1_000', '1,000', ' 1000', '1000 ', '0x64', 'NaN', 'Infinity', '']) {
      expect(refusalCode({ ...base, totalSupply }), totalSupply).toBe('launch.invalid_supply');
    }
  });
});

describe('the ledger-representability ceiling', () => {
  it('accepts a supply at the ceiling', () => {
    expect(parseTokenParams({ ...base, decimals: 0, totalSupply: MAX_WHOLE_SUPPLY.toString() }).totalSupply).toBe(MAX_WHOLE_SUPPLY);
  });

  /**
   * 10^20 whole tokens needs 21 integer digits; `numeric(38,18)` has 20. A
   * token past this point could never be listed, quoted, escrowed or reconciled
   * on the Fiat Plane — and there would be no way to tell the creator afterwards
   * except that nothing works.
   */
  it('refuses one above it, with its own code', () => {
    expect(refusalCode({ ...base, decimals: 0, totalSupply: (MAX_WHOLE_SUPPLY + 1n).toString() })).toBe('launch.supply_out_of_range');
  });

  it('measures the ceiling in whole tokens, not base units', () => {
    // 10^20 − 1 whole tokens at 18 decimals is a vast base-unit figure and is
    // still fine: the ledger stores the whole part, and the 18 fractional
    // digits are exactly what numeric(38,18) is for.
    expect(() => parseTokenParams({ ...base, decimals: 18, totalSupply: MAX_WHOLE_SUPPLY.toString() })).not.toThrow();
  });
});

describe('decimals', () => {
  it('accepts the full permitted range', () => {
    for (const decimals of [0, 1, 6, 8, 18]) {
      expect(parseTokenParams({ ...base, decimals, totalSupply: '1' }).decimals).toBe(decimals);
    }
  });

  it('refuses above 18, because the ledger reconciles to 18dp', () => {
    expect(refusalCode({ ...base, decimals: MAX_DECIMALS + 1 })).toBe('launch.invalid_decimals');
  });

  it('refuses negative and non-integer decimals', () => {
    expect(refusalCode({ ...base, decimals: -1 })).toBe('launch.invalid_decimals');
    expect(refusalCode({ ...base, decimals: 6.5 })).toBe('launch.invalid_decimals');
    expect(refusalCode({ ...base, decimals: Number.NaN })).toBe('launch.invalid_decimals');
  });
});

describe('name and symbol — measured in bytes, and free of invisible characters', () => {
  it('accepts a plain name and symbol', () => {
    const parsed = parseTokenParams(base);
    expect(parsed.name).toBe('Sovereign One');
    expect(parsed.symbol).toBe('SOV');
  });

  it('refuses empty', () => {
    expect(refusalCode({ ...base, name: '' })).toBe('launch.invalid_name');
    expect(refusalCode({ ...base, symbol: '' })).toBe('launch.invalid_symbol');
  });

  /**
   * `bytes(name).length` in Solidity counts BYTES. A 64-character name of
   * multi-byte code points is 128+ bytes and the contract would revert — after
   * the creator paid gas. Measuring the same way here means the refusal arrives
   * before the transaction, not inside it.
   */
  it('counts UTF-8 bytes, not JS code units', () => {
    // 32 three-byte characters = 96 bytes, over the 64-byte name limit, though
    // it is only 32 characters long.
    expect(refusalCode({ ...base, name: '通'.repeat(32) })).toBe('launch.invalid_name');
    // 21 of them is 63 bytes, and fits.
    expect(() => parseTokenParams({ ...base, name: '通'.repeat(21) })).not.toThrow();
    expect(refusalCode({ ...base, symbol: 'Ü'.repeat(9) })).toBe('launch.invalid_symbol');
  });

  /**
   * A token name sits next to a price, forever. U+202E reverses the rendering of
   * everything after it, which is the standard way to make one ticker display as
   * another; the zero-width set makes two different tokens look identical. There
   * is no edit and no takedown afterwards — only this refusal.
   */
  it('refuses bidirectional overrides and zero-width characters', () => {
    // Constructed from code points, never written as literals. Every one of
    // these is invisible, so a literal here would be a test nobody can read and
    // a diff nobody can review — the same reason `params.ts` lists them as
    // numeric ranges rather than as a character class.
    const cp = String.fromCodePoint;
    const RLO = cp(0x202e); // right-to-left override
    const ZWSP = cp(0x200b); // zero-width space
    const SHY = cp(0x00ad); // soft hyphen
    const BOM = cp(0xfeff); // zero-width no-break space
    const LRI = cp(0x2066); // left-to-right isolate
    const NUL = cp(0x0000); // C0 control

    expect(refusalCode({ ...base, name: `Good${RLO}daB` })).toBe('launch.invalid_name');
    expect(refusalCode({ ...base, symbol: `SO${ZWSP}V` })).toBe('launch.invalid_symbol');
    expect(refusalCode({ ...base, name: `A${SHY}B` })).toBe('launch.invalid_name');
    expect(refusalCode({ ...base, name: `A${BOM}B` })).toBe('launch.invalid_name');
    expect(refusalCode({ ...base, symbol: `S${LRI}OV` })).toBe('launch.invalid_symbol');
    expect(refusalCode({ ...base, name: `A${NUL}B` })).toBe('launch.invalid_name');
  });

  it('names the offending code point, so the creator can find it', () => {
    try {
      parseTokenParams({ ...base, name: `Good${String.fromCodePoint(0x202e)}daB` });
      throw new Error('expected a refusal');
    } catch (err) {
      expect((err as Error).message).toContain('U+202E');
    }
  });

  it('refuses leading or trailing whitespace, which is invisible and permanent', () => {
    expect(refusalCode({ ...base, name: ' Sovereign' })).toBe('launch.invalid_name');
    expect(refusalCode({ ...base, symbol: 'SOV ' })).toBe('launch.invalid_symbol');
  });

  /** Ordinary non-ASCII is fine. The rule is about invisibility, not about English. */
  it('accepts legitimate multi-byte names', () => {
    const parsed = parseTokenParams({ ...base, name: 'Ünïcödé Tökén 通貨', symbol: 'ÜNÏ' });
    expect(parsed.name).toBe('Ünïcödé Tökén 通貨');
  });
});

describe('recipient', () => {
  it('refuses the zero address — it would burn the whole supply at creation', () => {
    expect(refusalCode({ ...base, recipient: '0x0000000000000000000000000000000000000000' })).toBe('launch.invalid_recipient');
  });
});
