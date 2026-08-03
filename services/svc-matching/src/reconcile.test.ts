import { describe, expect, it } from 'vitest';
import { MemoryEventBus } from '@intafaced/events';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MatchingEngine } from './engine/engine.js';
import { MemoryJournal } from './engine/journal.js';
import type { EngineLiveOrder, EngineOrder } from './engine/types.js';
import { reconcile, type CounterpartOrder } from './reconcile.js';

/**
 * ENGINE ↔ COUNTERPART RECONCILE.
 *
 * There is no database in this file and there should not be. svc-matching has no
 * `DATABASE_URL` by design (`env.ts` says so, and says why), so a suite that
 * stood one up would be testing a coupling this service must never have. The
 * DB-backed half of reconciliation is svc-trade's `order-route-reconcile.test.ts`,
 * which already runs on a per-run `createTestDatabase`.
 *
 * The engine's side is proven against a REAL `MatchingEngine` with a real book
 * rather than hand-written `EngineLiveOrder` literals, because the claim being
 * made is "the engine reports what it is actually holding" — and a fixture
 * cannot be wrong in the way the engine can.
 */

const MARKET = 'BTC-USDT';
const OTHER_MARKET = 'ETH-USDT';

function engineWith(): MatchingEngine {
  return new MatchingEngine({ journal: new MemoryJournal(), bus: new MemoryEventBus('svc-matching'), snapshotEvery: 0 });
}

function limit(orderId: string, side: 'buy' | 'sell', qty: string, price: string): EngineOrder {
  return { orderId, accountId: `acct-${orderId}`, type: 'limit', side, qty: parseAmount(qty), price: parseAmount(price), stopPrice: null, tif: 'GTC' };
}

function claim(over: Partial<CounterpartOrder> & { orderId: string }): CounterpartOrder {
  return { marketId: MARKET, state: 'open', remaining: '1', funded: true, ...over };
}

// ── The engine's own liveness read ───────────────────────────────────────────

describe('restingOrders — the non-destructive read', () => {
  it('reports a resting order with its id, account and remaining, and does not remove it', async () => {
    const engine = engineWith();
    await engine.submit(MARKET, limit('o1', 'buy', '2', '100'));

    const first = engine.restingOrders();
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ marketId: MARKET, orderId: 'o1', accountId: 'acct-o1', kind: 'book', side: 'buy', remaining: '2' });

    // The point of the whole exercise: asking twice gives the same answer.
    // `cancel()` — the only probe that existed before — would not.
    expect(engine.restingOrders()).toEqual(first);
    expect(engine.depth(MARKET)?.bids).toEqual([['100', '2']]);
  });

  it('reports the unfilled remainder after a partial fill, not the original qty', async () => {
    const engine = engineWith();
    await engine.submit(MARKET, limit('maker', 'sell', '5', '100'));
    await engine.submit(MARKET, limit('taker', 'buy', '2', '100'));

    const live = engine.restingOrders();
    expect(live).toHaveLength(1);
    expect(live[0]?.orderId).toBe('maker');
    // 5 submitted, 2 taken. A reconciler comparing against the hold needs 3.
    expect(live[0]?.remaining).toBe('3');
  });

  it('includes an untriggered stop, which never appears in depth', async () => {
    const engine = engineWith();
    await engine.submit(MARKET, {
      orderId: 'stop-1',
      accountId: 'acct-stop',
      type: 'stop',
      side: 'sell',
      qty: parseAmount('4'),
      price: null,
      stopPrice: parseAmount('90'),
      tif: 'GTC',
    });

    // Invisible in depth — and svc-trade is holding funds for it all the same.
    expect(engine.depth(MARKET)).toEqual({ bids: [], asks: [], sequence: 1 });

    const live = engine.restingOrders();
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ orderId: 'stop-1', kind: 'stop', remaining: '4', price: '90' });
  });

  it('is empty once an order is cancelled, and filters by market', async () => {
    const engine = engineWith();
    await engine.submit(MARKET, limit('o1', 'buy', '1', '100'));
    await engine.submit(OTHER_MARKET, limit('o2', 'buy', '1', '100'));

    expect(engine.restingOrders()).toHaveLength(2);
    expect(engine.restingOrders(MARKET).map((o) => o.orderId)).toEqual(['o1']);
    expect(engine.restingOrders('never-traded')).toEqual([]);

    await engine.cancel(MARKET, 'o1');
    expect(engine.restingOrders().map((o) => o.orderId)).toEqual(['o2']);
  });

  it('survives replay — the count after recovery is the count before it', async () => {
    const journal = new MemoryJournal();
    const bus = new MemoryEventBus('svc-matching');
    const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0 });
    await engine.submit(MARKET, limit('o1', 'buy', '2', '100'));
    await engine.submit(MARKET, limit('o2', 'buy', '3', '99'));
    const before = engine.restingOrders();

    // This is the boot path that strands things: a fresh process, the same
    // journal, and no database on the other side any more.
    const rebooted = new MatchingEngine({ journal, bus, snapshotEvery: 0 });
    rebooted.recover();

    expect(rebooted.restingOrders()).toEqual(before);
    expect(rebooted.restingOrderCount).toBe(2);
  });
});

// ── The failure modes, in both directions ────────────────────────────────────

describe('reconcile — a clean pair is silent', () => {
  it('reports ok with no findings when both sides agree', async () => {
    const engine = engineWith();
    await engine.submit(MARKET, limit('o1', 'buy', '2', '100'));

    const report = reconcile(engine.restingOrders(), [claim({ orderId: 'o1', remaining: '2' })]);

    expect(report.findings).toEqual([]);
    expect(report).toMatchObject({ ok: true, refusals: 0, agreed: 1, checked: 1 });
  });

  it('treats a decimal string that spells the same amount as agreement', async () => {
    const engine = engineWith();
    await engine.submit(MARKET, limit('o1', 'buy', '2', '100'));

    // `2` and `2.000000000000000000` are one amount and two strings. Comparing
    // them as strings would report a quantity disagreement on every order.
    const report = reconcile(engine.restingOrders(), [claim({ orderId: 'o1', remaining: '2.000000000000000000' })]);

    expect(report.ok).toBe(true);
    expect(report.findings).toEqual([]);
  });

  it('says nothing when both sides agree an order is over', () => {
    const report = reconcile([], [claim({ orderId: 'gone', state: 'terminal', remaining: '0', funded: false })]);
    expect(report).toMatchObject({ ok: true, agreed: 1 });
    expect(report.findings).toEqual([]);
  });
});

describe('reconcile — ledger has a hold the engine does not (the one that strands money)', () => {
  it('refuses, and names the order and both states', () => {
    const report = reconcile([], [claim({ orderId: 'stranded-1', remaining: '2', funded: true, detail: 'hold=200 USDT' })]);

    expect(report.ok).toBe(false);
    expect(report.refusals).toBe(1);

    const finding = report.findings[0];
    expect(finding?.orderId).toBe('stranded-1');
    expect(finding?.case).toBe('counterpart_open_engine_missing');
    expect(finding?.verdict).toBe('refuse');

    // Both states named. A refusal that reports one side is not actionable.
    expect(finding?.engine).toContain('NOT LIVE');
    expect(finding?.counterpart).toContain('OPEN');
    expect(finding?.counterpart).toContain('remaining=2');
    expect(finding?.counterpart).toContain('hold=200 USDT');

    // And it says WHY it will not just release, which is the whole argument.
    expect(finding?.reason).toMatch(/lost fill/i);
  });

  it('does not auto-release — no verdict in the report authorises moving value', () => {
    const report = reconcile([], [claim({ orderId: 'stranded-1', funded: true })]);
    expect(report.findings.every((f) => f.verdict !== 'auto')).toBe(true);
  });
});

describe('reconcile — journal has an order the counterpart does not', () => {
  it('refuses rather than cancelling a book it cannot see all of', async () => {
    const engine = engineWith();
    await engine.submit(MARKET, limit('phantom', 'sell', '1', '100'));

    // This is the live dev-fleet shape: the engine replayed orders from a
    // journal that outlived the database, and `trade.orders` is empty.
    const report = reconcile(engine.restingOrders(), []);

    expect(report.ok).toBe(false);
    const finding = report.findings[0];
    expect(finding?.case).toBe('engine_only');
    expect(finding?.verdict).toBe('refuse');
    expect(finding?.engine).toContain('LIVE');
    expect(finding?.counterpart).toContain('UNKNOWN');
    expect(finding?.reason).toMatch(/incomplete counterpart view/i);
  });
});

describe('reconcile — both have it but disagree', () => {
  it('refuses on a quantity disagreement, naming both quantities', async () => {
    const engine = engineWith();
    await engine.submit(MARKET, limit('maker', 'sell', '5', '100'));
    await engine.submit(MARKET, limit('taker', 'buy', '2', '100'));

    // The engine took 2 of the 5. The counterpart never saw the fill event, so
    // it still believes 5 are working — and is holding for 5.
    const report = reconcile(
      engine.restingOrders(),
      [claim({ orderId: 'maker', state: 'open', remaining: '5', funded: true })],
    );

    expect(report.ok).toBe(false);
    const finding = report.findings.find((f) => f.orderId === 'maker');
    expect(finding?.case).toBe('quantity_disagreement');
    expect(finding?.verdict).toBe('refuse');
    expect(finding?.engine).toContain('remaining=3');
    expect(finding?.counterpart).toContain('remaining=5');
  });

  it('refuses when the counterpart calls it terminal and the engine is still working it', async () => {
    const engine = engineWith();
    await engine.submit(MARKET, limit('o1', 'buy', '2', '100'));

    const report = reconcile(engine.restingOrders(), [claim({ orderId: 'o1', state: 'terminal', remaining: '0', funded: false })]);

    const finding = report.findings[0];
    expect(finding?.case).toBe('counterpart_terminal_engine_live');
    expect(finding?.verdict).toBe('refuse');
    expect(finding?.engine).toContain('LIVE');
    expect(finding?.counterpart).toContain('TERMINAL');
    expect(finding?.reason).toMatch(/free book risk/i);
  });

  it('refuses when one order id is resting under a different market than the caller believes', async () => {
    const engine = engineWith();
    await engine.submit(MARKET, limit('o1', 'buy', '2', '100'));

    const report = reconcile(engine.restingOrders(), [claim({ orderId: 'o1', marketId: OTHER_MARKET, remaining: '2' })]);

    const finding = report.findings[0];
    expect(finding?.case).toBe('market_disagreement');
    expect(finding?.verdict).toBe('refuse');
    expect(finding?.engine).toContain(`market=${MARKET}`);
    expect(finding?.counterpart).toContain(`market=${OTHER_MARKET}`);
  });

  it('refuses on an unreadable quantity instead of coercing one', async () => {
    const engine = engineWith();
    await engine.submit(MARKET, limit('o1', 'buy', '2', '100'));

    const report = reconcile(engine.restingOrders(), [claim({ orderId: 'o1', remaining: 'not-a-number' })]);

    expect(report.findings[0]?.case).toBe('unreadable_amount');
    expect(report.findings[0]?.verdict).toBe('refuse');
  });
});

describe('reconcile — the one case that is safe to automate', () => {
  it('marks an unfunded intent row the engine never saw as auto, and does not count it as a refusal', () => {
    const report = reconcile([], [claim({ orderId: 'orphan', state: 'pending', remaining: '2', funded: false })]);

    const finding = report.findings[0];
    expect(finding?.case).toBe('counterpart_unfunded_engine_missing');
    expect(finding?.verdict).toBe('auto');
    expect(finding?.reason).toMatch(/moves no value/i);

    // `auto` is a finding, not a problem: ok stays true so a scheduled check
    // does not page anyone for a row svc-trade can clean up on its own.
    expect(report.ok).toBe(true);
    expect(report.refusals).toBe(0);
  });

  it('is NOT auto once the same row is funded — the hold is the whole difference', () => {
    const funded = reconcile([], [claim({ orderId: 'orphan', state: 'pending', remaining: '2', funded: true })]);
    expect(funded.findings[0]?.verdict).toBe('refuse');
    expect(funded.ok).toBe(false);
  });
});

describe('reconcile — report shape', () => {
  it('sorts findings by order id so two runs read the same', async () => {
    const engine = engineWith();
    await engine.submit(MARKET, limit('zzz', 'buy', '1', '100'));
    await engine.submit(MARKET, limit('aaa', 'buy', '1', '99'));

    const report = reconcile(engine.restingOrders(), []);
    expect(report.findings.map((f) => f.orderId)).toEqual(['aaa', 'zzz']);
  });

  it('counts both directions in a mixed run', async () => {
    const engine = engineWith();
    await engine.submit(MARKET, limit('agreed', 'buy', '1', '100'));
    await engine.submit(MARKET, limit('phantom', 'buy', '1', '99'));

    const report = reconcile(engine.restingOrders(), [
      claim({ orderId: 'agreed', remaining: '1' }),
      claim({ orderId: 'stranded', funded: true }),
      claim({ orderId: 'orphan', state: 'pending', funded: false }),
    ]);

    expect(report.agreed).toBe(1);
    expect(report.refusals).toBe(2); // phantom (engine_only) + stranded
    expect(report.ok).toBe(false);
    expect(report.findings.map((f) => f.case).sort()).toEqual([
      'counterpart_open_engine_missing',
      'counterpart_unfunded_engine_missing',
      'engine_only',
    ]);
  });
});

// ── Type-level guard ─────────────────────────────────────────────────────────
//
// `EngineLiveOrder` is what crosses the wire. If a field ever becomes a JS
// number, money precision leaves with it.
describe('EngineLiveOrder carries amounts as strings', () => {
  it('has no numeric price or quantity', async () => {
    const engine = engineWith();
    await engine.submit(MARKET, limit('o1', 'buy', '0.000000000000000001', '100'));

    const live = engine.restingOrders()[0] as EngineLiveOrder;
    expect(typeof live.price).toBe('string');
    expect(typeof live.remaining).toBe('string');
    // The 18th decimal place survives, which is the reason for the rule.
    expect(live.remaining).toBe('0.000000000000000001');
  });
});
