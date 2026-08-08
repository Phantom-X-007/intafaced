import { describe, expect, it } from 'vitest';
import { AcademyError } from '../errors.js';
import {
  assertSealedSimulated,
  isSealedSimulated,
  isValuationComplete,
  sealSimulated,
  SIMULATED_DISCLAIMER,
  SIMULATED_SEAL,
  simulatedLabelLine,
  simulatedTotalPnlOrRefuse,
  simulatedValuationLine,
  valueSimulatedDrill,
  type PublishedFill,
} from './simulated-result.js';

const fill = (over: Partial<PublishedFill> = {}): PublishedFill => ({
  fillId: 'f-1',
  marketId: 'mkt-paper-1',
  side: 'buy',
  price: '100',
  size: '2',
  ...over,
});

describe('the seal — a simulated figure cannot leave unlabelled', () => {
  it('seals a payload with all four assertions and the full disclaimer', () => {
    const sealed = sealSimulated({ realisedPnl: '12.5' });

    expect(sealed.simulated).toBe(true);
    expect(sealed.venue).toBe('paper');
    expect(sealed.realLedger).toBe(false);
    expect(sealed.withdrawable).toBe(false);
    expect(sealed.disclaimer).toBe(SIMULATED_DISCLAIMER);
    expect(sealed.result).toEqual({ realisedPnl: '12.5' });
  });

  it('the disclaimer says all three things a reader needs, not an abbreviation', () => {
    expect(SIMULATED_DISCLAIMER).toMatch(/no value moved/i);
    expect(SIMULATED_DISCLAIMER).toMatch(/no ledger entry/i);
    expect(SIMULATED_DISCLAIMER).toMatch(/withdrawable/i);
  });

  /**
   * The point of the row. Each case is a result that LOOKS finished and is
   * missing exactly one thing that keeps a reader from thinking it is real.
   */
  it.each([
    ['no seal at all', { result: { realisedPnl: '12.5' } }],
    ['simulated stripped', { ...SIMULATED_SEAL, simulated: undefined, result: {} }],
    ['simulated flipped to false', { ...SIMULATED_SEAL, simulated: false, result: {} }],
    ['venue claimed as live', { ...SIMULATED_SEAL, venue: 'live', result: {} }],
    ['realLedger claimed true', { ...SIMULATED_SEAL, realLedger: true, result: {} }],
    ['withdrawable claimed true', { ...SIMULATED_SEAL, withdrawable: true, result: {} }],
    ['disclaimer blanked', { ...SIMULATED_SEAL, disclaimer: '', result: {} }],
    ['payload missing entirely', { ...SIMULATED_SEAL }],
  ])('REFUSES to let a result through with %s', (_why, payload) => {
    expect(isSealedSimulated(payload)).toBe(false);
    expect(() => assertSealedSimulated(payload as never)).toThrow(AcademyError);
    try {
      assertSealedSimulated(payload as never);
    } catch (err) {
      expect((err as AcademyError).code).toBe('academy.paper_result_unlabelled');
    }
  });

  it('lets a properly sealed result through unchanged', () => {
    const sealed = sealSimulated({ ok: true });
    expect(assertSealedSimulated(sealed)).toBe(sealed);
  });

  it('the label survives being copied into a log line', () => {
    expect(simulatedLabelLine()).toBe('simulated=1 venue=paper realLedger=0 withdrawable=0');
  });
});

describe('valuation uses trade-published prices and refuses to invent one', () => {
  it('values a round trip at the published prices', () => {
    const v = valueSimulatedDrill([
      fill({ fillId: 'f-1', side: 'buy', price: '100', size: '2' }),
      fill({ fillId: 'f-2', side: 'sell', price: '110', size: '2' }),
    ]);

    expect(v.boughtSize).toBe('2');
    expect(v.soldSize).toBe('2');
    expect(v.openSize).toBe('0');
    expect(v.averageBuyPrice).toBe('100');
    expect(v.averageSellPrice).toBe('110');
    expect(v.realisedPnl).toBe('20'); // (110 - 100) × 2
    expect(v.unrealisedPnl).toBe('0');
    expect(v.totalPnl).toBe('20');
    expect(v.markUnavailable).toBe(false);
    expect(isValuationComplete(v)).toBe(true);
  });

  it('averages several buys at their own published prices', () => {
    const v = valueSimulatedDrill([
      fill({ fillId: 'f-1', side: 'buy', price: '100', size: '1' }),
      fill({ fillId: 'f-2', side: 'buy', price: '120', size: '1' }),
      fill({ fillId: 'f-3', side: 'sell', price: '130', size: '2' }),
    ]);

    expect(v.averageBuyPrice).toBe('110');
    expect(v.realisedPnl).toBe('40'); // (130 - 110) × 2
  });

  it('carries decimals no float could — 0.1 + 0.2 stays 0.3', () => {
    const v = valueSimulatedDrill([
      fill({ fillId: 'f-1', side: 'buy', price: '0.1', size: '1' }),
      fill({ fillId: 'f-2', side: 'buy', price: '0.2', size: '1' }),
    ]);

    // A float average of 0.1 and 0.2 is 0.15000000000000002.
    expect(v.averageBuyPrice).toBe('0.15');
  });

  it('a loss is reported as a loss, signed', () => {
    const v = valueSimulatedDrill([
      fill({ fillId: 'f-1', side: 'buy', price: '100', size: '3' }),
      fill({ fillId: 'f-2', side: 'sell', price: '90', size: '3' }),
    ]);

    expect(v.realisedPnl).toBe('-30');
  });

  it('a drill with no fills at all is flat, not an error', () => {
    const v = valueSimulatedDrill([]);
    expect(v.fillCount).toBe(0);
    expect(v.realisedPnl).toBe('0');
    expect(v.totalPnl).toBe('0');
    expect(v.averageBuyPrice).toBeNull();
  });

  it.each([
    ['a missing price', fill({ price: undefined as unknown as string })],
    ['a blank price', fill({ price: '   ' })],
    ['a price sent as a number', fill({ price: 100 as unknown as string })],
    ['a size sent as a number', fill({ size: 2 as unknown as string })],
    ['a negative price', fill({ price: '-100' })],
    ['an unreadable price', fill({ price: 'about a hundred' })],
    ['no side', fill({ side: undefined as unknown as 'buy' })],
  ])('REFUSES to value a fill with %s rather than guessing', (_why, bad) => {
    expect(() => valueSimulatedDrill([bad])).toThrow(AcademyError);
    try {
      valueSimulatedDrill([bad]);
    } catch (err) {
      expect((err as AcademyError).code).toBe('academy.paper_price_unavailable');
      expect((err as AcademyError).message).toMatch(/invent/i);
    }
  });
});

describe('an open position with no published mark is reported unmarked, never marked by us', () => {
  const open = [fill({ fillId: 'f-1', side: 'buy', price: '100', size: '2' })];

  it('says so instead of pricing the open size itself', () => {
    const v = valueSimulatedDrill(open, null);

    expect(v.openSize).toBe('2');
    expect(v.realisedPnl).toBe('0'); // nothing closed, so nothing realised
    expect(v.unrealisedPnl).toBeNull();
    expect(v.totalPnl).toBeNull();
    expect(v.markUnavailable).toBe(true);
    expect(isValuationComplete(v)).toBe(false);
  });

  it('does NOT fall back to the last traded price, which is the tempting bug', () => {
    const v = valueSimulatedDrill(open, null);
    expect(v.unrealisedPnl).not.toBe('0');
    expect(v.unrealisedPnl).toBeNull();
  });

  it('marks the open size once trade publishes a mark', () => {
    const v = valueSimulatedDrill(open, '115');

    expect(v.unrealisedPnl).toBe('30'); // (115 - 100) × 2
    expect(v.totalPnl).toBe('30');
    expect(v.markUnavailable).toBe(false);
  });

  it('marks an open SHORT from the published sell average', () => {
    const v = valueSimulatedDrill([fill({ fillId: 'f-1', side: 'sell', price: '100', size: '2' })], '90');

    expect(v.openSize).toBe('-2');
    expect(v.unrealisedPnl).toBe('20'); // (90 - 100) × -2
  });

  it('refuses a mark that is itself unreadable rather than dropping it silently', () => {
    expect(() => valueSimulatedDrill(open, 'about 115')).toThrow(AcademyError);
  });

  it('a total demanded over an unmarked position is a refusal, not a partial', () => {
    const v = valueSimulatedDrill(open, null);
    expect(() => simulatedTotalPnlOrRefuse(v)).toThrow(AcademyError);
    expect(simulatedTotalPnlOrRefuse(valueSimulatedDrill(open, '115'))).toBe('30');
  });

  it('the operator line carries the seal and says "unmarked" out loud', () => {
    const line = simulatedValuationLine(valueSimulatedDrill(open, null));
    expect(line).toContain('simulated=1');
    expect(line).toContain('total=unmarked');
  });
});
