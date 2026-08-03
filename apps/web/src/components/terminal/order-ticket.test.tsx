import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Market, Order } from '@/lib/api/wire';
import type { Result } from '@/lib/result';
import { describeInventedIncrements, findInventedIncrements } from '@/testing/fabricated-money';
import { OrderTicketView, type TicketSession } from './order-ticket';

/**
 * THE ORDER TICKET, AND THE GRID IT REFUSES TO GUESS.
 *
 * `renderToStaticMarkup` does not run effects, so what these tests observe is
 * the first render — which is exactly where `blocked` decides whether the submit
 * button is enabled and what it says. That is the whole surface under test.
 *
 * The fixture is the real payload shape from svc-trade's `presentMarket`
 * (`services/svc-trade/src/router.ts`): every increment is a decimal string.
 * `lotSize: '1000'` in the FX case is not contrived — it is what the six FX
 * majors actually list at, and it is the case that breaks any client treating a
 * lot as a count of decimal places rather than as a multiple.
 */

function market(over: Partial<Market> = {}): Market {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    symbol: 'BTC/USDT',
    base: 'BTC',
    quote: 'USDT',
    kind: 'spot',
    status: 'active',
    tickSize: '0.01',
    lotSize: '0.0001',
    minQty: '0.0001',
    maxQty: null,
    minNotional: '10',
    makerBps: 10,
    takerBps: 20,
    listedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

const SIGNED_IN: TicketSession = { status: 'authenticated', tier: 'basic' };

/** The view never calls `place` on first render; it exists to satisfy the type. */
const neverPlaces = (): Promise<Result<Order>> => {
  throw new Error('place() must not be called during a static render');
};

function render(m: Market | null, session: TicketSession = SIGNED_IN): string {
  return renderToStaticMarkup(<OrderTicketView market={m} session={session} place={neverPlaces} />);
}

/** The submit button carries `disabled` when the ticket refuses. */
function submitIsDisabled(html: string): boolean {
  const button = html.match(/<button[^>]*type="submit"[^>]*>/);
  expect(button, 'no submit button rendered').not.toBeNull();
  return button![0].includes('disabled');
}

describe('OrderTicketView — an absent increment is refused, never substituted', () => {
  /**
   * The regression this file was written for.
   *
   * `terminal.tsx` supplied `tickSize ?? '0.01'` and `lotSize ?? '0.00000001'`.
   * Nothing ever rendered those strings, so no markup scan could see them — they
   * silently set the precision a real market's book was drawn at.
   *
   * Zero is the shape a bad deployment actually produces: it satisfies the
   * decimal regex in `wire.ts`, so the schema accepts it and the market reaches
   * this component. `price % 0n` would throw; a substituted tick would be worse.
   */
  describe('a market that published no usable tick size', () => {
    const noTick = market({ tickSize: '0' });

    it('refuses to submit', () => {
      expect(submitIsDisabled(render(noTick))).toBe(true);
    });

    it('says which increment is missing, rather than a generic failure', () => {
      const html = render(noTick);

      expect(html).toContain('did not publish a tick size');
      expect(html).not.toContain('Request failed');
    });

    it('substitutes neither of the two literals that used to be hardcoded', () => {
      const html = render(noTick);

      expect(html).not.toContain('0.00000001');
      expect(html).not.toMatch(/>\s*0\.01\s*</);
    });
  });

  describe('a market that published no usable lot size', () => {
    const noLot = market({ lotSize: '0' });

    it('refuses to submit and names the lot', () => {
      const html = render(noLot);

      expect(submitIsDisabled(html)).toBe(true);
      expect(html).toContain('did not publish a lot size');
    });

    it('refuses even though a market order carries no price', () => {
      // The tick is irrelevant without a price. The lot still decides the size,
      // so a guessed lot still mis-sizes the order.
      expect(submitIsDisabled(render(noLot))).toBe(true);
    });
  });

  describe('no market selected', () => {
    it('refuses, and renders no notional figure', () => {
      const html = render(null);

      expect(submitIsDisabled(html)).toBe(true);
      expect(html).toContain('Select a market');
      // The `: 2` decimal-place default that used to sit behind the notional row.
      expect(html).not.toContain('0.00');
    });
  });
});

describe('OrderTicketView — the refusal ladder mirrors svc-trade', () => {
  it('blocks an unauthenticated session before it reads any figure', () => {
    const html = render(market(), { status: 'anonymous', tier: null });

    expect(submitIsDisabled(html)).toBe(true);
    expect(html).toContain('Sign in');
  });

  it('does not treat an unreadable tier as permission', () => {
    const html = render(market(), { status: 'authenticated', tier: null });

    expect(submitIsDisabled(html)).toBe(true);
    expect(html).toContain('Verification tier could not be read');
  });

  it('blocks a market that is not tradable', () => {
    const html = render(market({ status: 'halted' }));

    expect(submitIsDisabled(html)).toBe(true);
    expect(html).toContain('Market is not tradable');
  });

  it('asks for a size on a well-formed market, and does not claim an increment is missing', () => {
    const html = render(market());

    expect(submitIsDisabled(html)).toBe(true);
    expect(html).toContain('Enter a size');
    expect(html).not.toContain('did not publish');
  });

  it('accepts an FX market whose lot is 1000, not a decimal-place count', () => {
    const fx = market({ symbol: 'EUR/USD', base: 'EUR', quote: 'USD', tickSize: '0.00001', lotSize: '1000', minQty: '1000' });
    const html = render(fx);

    // The lot collapses to 0 decimal places. If the ticket read it that way it
    // would have nothing to enforce; it reads it as a multiple, so the market is
    // perfectly tradable and the only thing missing is a size.
    expect(html).toContain('Enter a size');
    expect(html).not.toContain('did not publish');
  });
});

describe('OrderTicketView — money never becomes a number', () => {
  it('uses the market increments verbatim as input placeholders', () => {
    const odd = market({ tickSize: '0.005', minQty: '0.00000001' });
    const html = render(odd);

    // Byte for byte. A placeholder parsed and re-emitted would lose the trailing
    // digit or gain an exponent.
    expect(html).toContain('placeholder="0.005"');
    expect(html).toContain('placeholder="0.00000001"');
  });

  it('renders price and size as text inputs, never type="number"', () => {
    // `type="number"` hands the value to the browser's float parser — the one
    // place a price could be rounded before this app ever sees it.
    const html = render(market());

    expect(html).not.toContain('type="number"');
    expect(html).toContain('inputMode="decimal"');
  });
});

/**
 * The scanner, pointed at the files it was extended for.
 *
 * `findMoneyShapes` scans rendered markup and structurally cannot see an
 * invented increment, because an invented increment is never rendered — it is
 * consumed by `decimalsOf`. This is the source-level half.
 */
describe('the terminal source carries no invented increments', () => {
  const files = ['terminal.tsx', 'order-ticket.tsx', 'live-book.tsx'];

  it.each(files)('%s', async (name) => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL(name, import.meta.url), 'utf8');
    const hits = findInventedIncrements(source);

    expect(hits, hits.length ? describeInventedIncrements(hits) : undefined).toEqual([]);
  });

  it('would have caught the defaults that shipped', () => {
    const regressed = `
      <LiveOrderBook
        tickSize={selected?.tickSize ?? '0.01'}
        lotSize={selected?.lotSize ?? '0.00000001'}
      />`;
    const hits = findInventedIncrements(regressed);

    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.rule.includes('literal decimal string'))).toBe(true);
  });

  it('would have caught the invented decimal-place count', () => {
    const hits = findInventedIncrements('const priceDp = market ? decimalsOf(market.tickSize) : 2;');

    expect(hits).toHaveLength(1);
    expect(hits[0]!.rule).toContain('literal digit count');
  });

  it('does not flag a null default, which is how absence is reported honestly', () => {
    expect(findInventedIncrements("tickSize={selected?.tickSize ?? null}")).toEqual([]);
  });
});
