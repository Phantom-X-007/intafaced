import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Ticker, TickerMap } from '@/lib/api/tickers';
import { failure } from '@/lib/result';
import type { Load } from '@/lib/use-service';
import { describeMoneyShapes, findMoneyShapes } from '@/testing/fabricated-money';
import { MarketPulseView } from './market-pulse';

/**
 * MARKET PULSE, IN EVERY STATE IT CAN HOLD.
 *
 * `page.test.tsx` renders the whole landing page, but `renderToStaticMarkup`
 * does not run effects, so it only ever sees this panel's first render. The
 * states that matter most — the one a visitor actually gets today, and the one
 * a visitor gets when the fleet is down — are only reachable by handing the
 * pure view a state directly. That is why `MarketPulseView` is split out.
 *
 * The fixture is the real payload shape, taken from svc-trade's `presentTicker`
 * (`services/svc-trade/src/public-rest.ts`): every price is a decimal string or
 * `null`, and the 24h rollups are `null` unconditionally because no windowed
 * aggregation job exists.
 */

function ticker(symbol: string, over: Partial<Ticker> = {}): Ticker {
  return {
    symbol,
    timestamp: 1_785_672_979_431,
    datetime: '2026-08-02T12:16:19.431Z',
    bid: null,
    ask: null,
    last: null,
    percentage: null,
    baseVolume: null,
    quoteVolume: null,
    ...over,
  };
}

function mapOf(...tickers: Ticker[]): TickerMap {
  return Object.fromEntries(tickers.map((t) => [t.symbol, t]));
}

function render(state: Load<TickerMap>): string {
  return renderToStaticMarkup(<MarketPulseView state={state} />);
}

function expectNoFabricatedMoney(html: string): void {
  const hits = findMoneyShapes(html);
  expect(hits, hits.length ? describeMoneyShapes(hits) : undefined).toEqual([]);
}

describe('MarketPulseView', () => {
  /**
   * Today's real answer. All sixteen listed markets return `last: null` — the
   * platform has never traded — and this is the state the old page replaced
   * with `BTC/USDT 68,412.50`.
   */
  describe('listed but never traded', () => {
    const state: Load<TickerMap> = {
      status: 'ok',
      value: mapOf(ticker('BTC/USDT'), ticker('ETH/USDT'), ticker('XAU/USDT')),
    };

    it('renders no figure at all', () => {
      expectNoFabricatedMoney(render(state));
    });

    it('does not render the absence as a zero', () => {
      const html = render(state);

      expect(html).not.toMatch(/>\s*0(\.0+)?\s*</);
      expect(html).not.toContain('$0');
      expect(html).not.toContain('0.00');
    });

    it('names every listed market and says each has not traded', () => {
      const html = render(state);

      for (const symbol of ['BTC/USDT', 'ETH/USDT', 'XAU/USDT']) {
        expect(html).toContain(symbol);
      }
      expect(html.match(/Not traded/g)).toHaveLength(3);
    });

    it('states the reason once, above the rows', () => {
      expect(render(state)).toContain('No listed market has traded yet');
    });

    it('does not claim to be live or streaming', () => {
      const html = render(state);

      expect(html).not.toContain('data-live="true"');
      expect(html).not.toContain('Streaming');
    });

    it('names where the data came from', () => {
      expect(render(state)).toContain('/api/v1/tickers');
    });
  });

  /**
   * The forward case. Nothing here asserts a *value* — it asserts that whatever
   * svc-trade sent is what reaches the DOM, byte for byte. A price that were
   * parsed, rounded or re-grouped on the way past would fail this, which is the
   * §0 rule ("money is never a number") expressed at the last inch where it
   * could still be broken.
   */
  describe('a market that has traded', () => {
    const state: Load<TickerMap> = {
      status: 'ok',
      value: mapOf(ticker('BTC/USDT', { last: '31337.123456789', percentage: '+2.41' }), ticker('ETH/USDT')),
    };

    it('renders the decimal string exactly as the service sent it', () => {
      const html = render(state);

      // Full precision, no separators inserted, no digits dropped.
      expect(html).toContain('31337.123456789');
      expect(html).not.toContain('31,337');
      expect(html).not.toContain('31337.12<');
    });

    it('renders the signed change once, not twice', () => {
      // `Ticker` prepends its own `+` to an unlabelled positive change while
      // svc-trade already signs the string. The landing page shipped `++2.41%`
      // for that reason.
      const html = render(state);

      expect(html).toContain('+2.41%');
      expect(html).not.toContain('++');
    });

    it('still shows the untraded market as untraded', () => {
      expect(render(state)).toContain('Not traded');
    });
  });

  describe('nothing listed', () => {
    const state: Load<TickerMap> = { status: 'ok', value: {} };

    it('says so, rather than rendering an empty tape', () => {
      const html = render(state);

      expect(html).toContain('svc-trade lists no markets');
      expectNoFabricatedMoney(html);
    });
  });

  describe('the service could not be reached', () => {
    const state: Load<TickerMap> = {
      status: 'failed',
      failure: failure('trade', '/api/v1/tickers', 'unreachable', 'connection refused'),
    };

    it('names the service and the path, and renders no figure', () => {
      const html = render(state);

      expect(html).toContain('svc-trade');
      expect(html).toContain('/api/v1/tickers');
      expect(html).toContain('unreachable');
      expectNoFabricatedMoney(html);
    });

    it('is not dressed as a live panel', () => {
      expect(render(state)).not.toContain('data-live="true"');
    });
  });

  describe('still reading', () => {
    const state: Load<TickerMap> = { status: 'loading' };

    it('says it is reading and renders no figure', () => {
      const html = render(state);

      expect(html).toContain('Reading listed markets');
      expectNoFabricatedMoney(html);
    });
  });

  describe('not asked', () => {
    const state: Load<TickerMap> = { status: 'idle', reason: 'No edge configured for this deployment' };

    it('renders the reason it was not asked', () => {
      const html = render(state);

      expect(html).toContain('No edge configured for this deployment');
      expectNoFabricatedMoney(html);
    });
  });
});
