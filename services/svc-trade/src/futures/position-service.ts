/**
 * Futures position open/close + positionUpdated fan-out (trade.futures F3–F4).
 *
 * STATE in trade.positions; MARGIN only via ledger recipes (Doctrine §0.6).
 * Publishes `positionUpdated` so svc-ws private positions channel is not silent
 * after real opens.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NO PRICE IN THIS FILE COMES FROM THE CALLER
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * `docs/adr/2026-08-05-futures-risk-and-mark-law.md`: **a price that moves money
 * is never supplied by the party it pays.**
 *
 * `open()` used to take `entryPrice` and `close()` used to take `exitPrice`,
 * both straight off the request. Entry price sizes the margin lock; exit price
 * is the entire realised PnL. A caller who named their own exit price named
 * their own profit, and `futuresRealizeProfit` paid it out of a house pot. The
 * service was careful everywhere else — `funding-tick.ts` tells its own oracle
 * "implementations MUST NOT invent a placeholder rate" — but the guard was on
 * the source and not on the caller, and a rule that stops the engine inventing a
 * price while the API accepts one from whoever is being paid protects nothing.
 *
 * Both prices now come from the injected `MarkSource`, which reads the venue
 * fabric or the matching book. Neither is anything a request body can set, and
 * both arrive labelled so `mark-policy.ts` can refuse them.
 *
 * The refusal shape matters as much as the source: a request that carries a
 * price is REFUSED at the REST edge rather than silently re-priced, so a caller
 * learns instead of getting different behaviour than they asked for.
 */
import type { Sql } from 'postgres';
import { randomUUID } from 'node:crypto';
import { formatAmount, parseAmount, recipes, type Amount, type LedgerClient } from '@intafaced/ledger-client';
import type { Position } from '@intafaced/exchange-contract';
import type { EventBus } from '@intafaced/events';
import { initialMargin } from './initial-margin.js';
import { planClose } from './close-planner.js';
import type { MarkSource } from './liquidation-tick.js';
import {
  DEFAULT_FUTURES_MARK_POLICY,
  acceptableForLiquidation,
  acceptableForMarking,
  markMissing,
  type FuturesQuotedMark,
  type MarkPolicy,
} from './mark-policy.js';
import { checkProfitBound, type ProfitSource } from './profit-source.js';

export class FuturesError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'FuturesError';
  }
}

export interface OpenPositionInput {
  userId: string;
  /** Market symbol, e.g. BTC/USDT-PERP — must be kind=futures and active. */
  symbol: string;
  side: 'long' | 'short';
  size: Amount;
  leverage: Amount;
  /**
   * Isolated only. `DIRECTION` §1, and the futures ADR's done bar item 8: *no
   * cross-margin path exists, even disabled*. `'cross'` is not a value this
   * type admits — the REST edge refuses it, and `open()` refuses it again for
   * callers TypeScript is not watching.
   */
  marginMode?: 'isolated';
}

export interface PositionServiceDeps {
  /**
   * Where prices come from. Required, and required to be a port the caller
   * cannot reach: making this optional would put the old defect one missing
   * argument away.
   */
  marks: MarkSource;
  /** The account realised profit is paid from, and the ceiling on it. */
  profitSource: ProfitSource;
  /** Optional: tests may omit; production passes JetStream bus. */
  bus?: EventBus | null;
  markPolicy?: MarkPolicy;
  now?: () => Date;
}

export interface PositionRow {
  id: string;
  user_id: string;
  market_id: string;
  side: 'long' | 'short';
  status: 'open' | 'closed' | 'liquidated';
  margin_mode: 'cross' | 'isolated';
  size: string;
  entry_price: string;
  leverage: string;
  margin_initial: string;
  margin_asset: string;
  funding_paid: string;
  liq_price: string | null;
  opened_at: Date;
  closed_at: Date | null;
  symbol: string;
}

export class PositionService {
  private readonly bus: EventBus | null;
  private readonly markPolicy: MarkPolicy;
  private readonly now: () => Date;

  constructor(
    private readonly sql: Sql,
    private readonly ledger: LedgerClient,
    private readonly deps: PositionServiceDeps,
  ) {
    this.bus = deps.bus ?? null;
    this.markPolicy = deps.markPolicy ?? DEFAULT_FUTURES_MARK_POLICY;
    this.now = deps.now ?? (() => new Date());
  }

  /**
   * Ask the mark port for a labelled price, and refuse rather than guess.
   *
   * Three refusals, all of them deliberate:
   *   · no quote at all → `trade.mark_missing`. NOT zero. A missing mark valued
   *     at zero does not misprice one position on a perp, it wipes out every
   *     long at once.
   *   · a quote the source can produce but the valuation gate rejects (stale,
   *     non-positive, dated in the future) → `trade.mark_unusable`.
   *   · a quote good enough to value but not to PAY on → refused by the caller
   *     via `requirePayoutGrade`, below.
   */
  private async markFor(marketId: string, symbol: string, at: Date): Promise<FuturesQuotedMark> {
    const quoted = this.deps.marks.quote
      ? await this.deps.marks.quote({ marketId, symbol, at })
      : await this.legacyQuote(marketId, symbol, at);

    if (!quoted) {
      throw new FuturesError(markMissing(marketId).reason!, 'trade.mark_missing', 503);
    }
    const check = acceptableForMarking(quoted, at, this.markPolicy);
    if (!check.ok) {
      throw new FuturesError(`Refusing to value this position — ${check.reason}`, check.code ?? 'trade.mark_unusable', 503);
    }
    return quoted;
  }

  /**
   * A source that predates `quote()` still gives a price and nothing else. Read
   * it as `mid` observed now — which is exactly what `markPrice` has always
   * implied — rather than inventing a quality it never claimed.
   */
  private async legacyQuote(marketId: string, symbol: string, at: Date): Promise<FuturesQuotedMark | null> {
    const price = await this.deps.marks.markPrice({ marketId, symbol, at });
    if (price == null || price.trim() === '') return null;
    let parsed: Amount;
    try {
      parsed = parseAmount(price);
    } catch {
      return null;
    }
    return { marketId, symbol, price: parsed, asOf: at, quality: 'mid' };
  }

  /**
   * A mark good enough to SHOW is not automatically good enough to PAY ON.
   *
   * `prices.ts`'s asymmetry, pointed the other way: a warning on a questionable
   * mark costs a notification, a payout on one costs real money that leaves the
   * platform. So a close that realises PROFIT must clear the same bar a
   * liquidation does — quality, the tighter staleness limit, the deviation
   * breaker — and `last` therefore cannot fund a payout.
   *
   * A losing or flat close is deliberately NOT held to that bar. It returns the
   * trader their own margin and pays out nothing; refusing it because the book
   * is one-sided would trap them in a position they asked to leave, and this
   * repo has already decided that a control which traps funds is not a safety
   * control (`TRADE_SPOT_ENABLED`).
   */
  private requirePayoutGrade(mark: FuturesQuotedMark, at: Date): void {
    const check = acceptableForLiquidation(mark, null, at, this.markPolicy);
    if (!check.ok) {
      throw new FuturesError(`Refusing to pay realised profit on this mark — ${check.reason}`, check.code ?? 'trade.mark_unusable', 503);
    }
  }

  async listOpen(userId: string, symbol?: string): Promise<Position[]> {
    const rows = symbol
      ? await this.sql<PositionRow[]>`
          SELECT p.*, m.symbol
          FROM trade.positions p
          JOIN trade.markets m ON m.id = p.market_id
          WHERE p.user_id = ${userId} AND p.status = 'open' AND m.symbol = ${symbol}
          ORDER BY p.opened_at DESC
        `
      : await this.sql<PositionRow[]>`
          SELECT p.*, m.symbol
          FROM trade.positions p
          JOIN trade.markets m ON m.id = p.market_id
          WHERE p.user_id = ${userId} AND p.status = 'open'
          ORDER BY p.opened_at DESC
        `;
    return rows.map((row) => presentPosition(row));
  }

  async open(input: OpenPositionInput): Promise<Position> {
    const market = await this.sql<
      {
        id: string;
        symbol: string;
        kind: string;
        status: string;
        quote_asset: string;
      }[]
    >`
      SELECT id, symbol, kind, status, quote_asset
      FROM trade.markets
      WHERE symbol = ${input.symbol}
      LIMIT 1
    `;
    const m = market[0];
    if (!m) throw new FuturesError(`unknown market ${input.symbol}`, 'trade.market_not_found', 404);
    if (m.kind !== 'futures') {
      throw new FuturesError(`market ${input.symbol} is ${m.kind}, not futures`, 'trade.not_futures_market', 400);
    }
    if (m.status !== 'active') {
      throw new FuturesError(`market ${input.symbol} is ${m.status}`, 'trade.market_not_tradable', 400);
    }

    // THE ENTRY PRICE IS READ, NOT RECEIVED. It sizes the margin lock and it is
    // the basis of every later PnL, so it is a price that moves money.
    const at = this.now();
    const mark = await this.markFor(m.id, m.symbol, at);
    const entryPrice = mark.price;

    // Second door. `assertPolicyCoherent`'s habit: the boundary refuses cross
    // margin, and so does the thing that would write the row, because the row
    // is what a liquidation later reads to decide whose money is at stake.
    if (input.marginMode != null && input.marginMode !== 'isolated') {
      throw new FuturesError(
        `margin mode "${String(input.marginMode)}" is not supported — isolated margin only (DIRECTION §1)`,
        'trade.cross_margin_unsupported',
        400,
      );
    }

    const leverage = input.leverage;
    const marginMode = input.marginMode ?? 'isolated';
    const margin = initialMargin({
      size: input.size,
      entryPrice,
      leverage,
    });
    const positionId = randomUUID();

    // Money first — never a position row without a ledger claim.
    await this.ledger.post(
      recipes.futuresMarginLock({
        positionId,
        userId: input.userId,
        assetId: m.quote_asset,
        amount: margin,
      }),
    );

    try {
      await this.sql`
        INSERT INTO trade.positions (
          id, user_id, market_id, side, status, margin_mode,
          size, entry_price, leverage, margin_initial, margin_asset, funding_paid
        ) VALUES (
          ${positionId},
          ${input.userId},
          ${m.id},
          ${input.side},
          'open',
          ${marginMode},
          ${formatAmount(input.size)},
          ${formatAmount(entryPrice)},
          ${formatAmount(leverage)},
          ${formatAmount(margin)},
          ${m.quote_asset},
          '0'
        )
      `;
    } catch (err) {
      // Roll margin back if the row failed (unique open, etc.).
      await this.ledger.post(
        recipes.futuresMarginRelease({
          positionId,
          userId: input.userId,
          assetId: m.quote_asset,
          amount: margin,
          sequence: 1,
        }),
      );
      throw err;
    }

    const [row] = await this.sql<PositionRow[]>`
      SELECT p.*, m.symbol
      FROM trade.positions p
      JOIN trade.markets m ON m.id = p.market_id
      WHERE p.id = ${positionId}
    `;
    await this.publishPositionUpdated(row!);
    return presentPosition(row!);
  }

  /**
   * Close an open position at the CURRENT MARK — read from the mark port, never
   * supplied by the trader being paid.
   *
   * Posts planClose recipes (profit / loss / flat) then marks the row closed.
   * Nothing posts until every refusal below has been cleared: a close that is
   * going to be refused must leave the books exactly as it found them.
   */
  async close(userId: string, positionId: string): Promise<Position> {
    const [row] = await this.sql<PositionRow[]>`
      SELECT p.*, m.symbol
      FROM trade.positions p
      JOIN trade.markets m ON m.id = p.market_id
      WHERE p.id = ${positionId} AND p.user_id = ${userId}
      LIMIT 1
    `;
    if (!row) throw new FuturesError('position not found', 'trade.position_not_found', 404);
    if (row.status !== 'open') {
      throw new FuturesError(`position is ${row.status}`, 'trade.position_not_open', 400);
    }

    const at = this.now();
    const mark = await this.markFor(row.market_id, row.symbol, at);

    const plan = planClose({
      closeId: `close:${row.id}:${randomUUID()}`,
      position: {
        positionId: row.id,
        userId,
        side: row.side,
        size: parseAmount(row.size),
        entryPrice: parseAmount(row.entry_price),
        margin: parseAmount(row.margin_initial),
        marginAsset: row.margin_asset,
      },
      exitPrice: formatAmount(mark.price),
    });
    if (!plan.close) {
      throw new FuturesError(`cannot close: ${plan.reason}`, 'trade.close_refused', 400);
    }

    if (plan.profit > 0n) {
      // Money is about to leave the platform on the strength of this mark, so it
      // has to be a mark we would seize on.
      this.requirePayoutGrade(mark, at);

      /**
       * THE PAYOUT BOUND. `bank.pool_underfunded`'s shape: an under-funded
       * profit source is an operator problem at the moment of the trade, not an
       * accounting surprise later. Checked before the first post, so a refusal
       * cannot leave the margin released and the position half closed.
       */
      const bound = await checkProfitBound({
        source: this.deps.profitSource,
        assetId: row.margin_asset,
        amount: plan.profit,
        balance: (ref) => this.ledger.balance(ref),
      });
      if (!bound.ok) {
        throw new FuturesError(
          `Cannot realise ${formatAmount(plan.profit)} ${row.margin_asset} of profit — ${bound.reason}`,
          'trade.profit_source_underfunded',
          409,
        );
      }
    }

    for (const recipe of plan.recipes) {
      await this.ledger.post(recipe);
    }

    await this.sql`
      UPDATE trade.positions
      SET status = 'closed', closed_at = now(), updated_at = now()
      WHERE id = ${positionId} AND user_id = ${userId} AND status = 'open'
    `;

    const [closed] = await this.sql<PositionRow[]>`
      SELECT p.*, m.symbol
      FROM trade.positions p
      JOIN trade.markets m ON m.id = p.market_id
      WHERE p.id = ${positionId}
    `;
    await this.publishPositionUpdated(closed!, {
      markPrice: formatAmount(plan.exitPrice),
      realizedPnl: formatAmount(plan.realizedPnl),
    });
    return presentPosition(closed!, {
      markPrice: formatAmount(plan.exitPrice),
      realizedPnl: formatAmount(plan.realizedPnl),
    });
  }

  /** Fan-out for private WS — honest nulls for mark/PnL until known. */
  private async publishPositionUpdated(
    row: PositionRow,
    extras?: { markPrice?: string | null; realizedPnl?: string | null },
  ): Promise<void> {
    if (!this.bus) return;
    const size = parseAmount(row.size);
    const entry = parseAmount(row.entry_price);
    const SCALE = 10n ** 18n;
    const notional = (size * entry) / SCALE;
    const ts = new Date().toISOString();
    await this.bus.publish(
      'positionUpdated',
      {
        positionId: row.id,
        userId: row.user_id,
        marketId: row.market_id,
        symbol: row.symbol,
        status: row.status,
        side: row.side,
        contracts: formatAmount(size),
        entryPrice: formatAmount(entry),
        markPrice: extras?.markPrice ?? null,
        notional: formatAmount(notional),
        leverage: formatAmount(parseAmount(row.leverage)),
        collateral: formatAmount(parseAmount(row.margin_initial)),
        unrealizedPnl: null,
        realizedPnl: extras?.realizedPnl ?? null,
        liquidationPrice: row.liq_price != null ? formatAmount(parseAmount(row.liq_price)) : null,
        marginMode: row.margin_mode,
        fundingPaid: formatAmount(parseAmount(row.funding_paid ?? '0')),
        ts,
      },
      { idempotencyKey: `trade.position.updated:${row.id}:${row.status}:${ts}` },
    );
  }
}

function presentPosition(row: PositionRow, extras?: { markPrice?: string | null; realizedPnl?: string | null }): Position {
  const size = parseAmount(row.size);
  const entry = parseAmount(row.entry_price);
  const leverage = parseAmount(row.leverage);
  const margin = parseAmount(row.margin_initial);
  const SCALE = 10n ** 18n;
  const notional = (size * entry) / SCALE;
  const opened = row.opened_at instanceof Date ? row.opened_at : new Date(row.opened_at);
  const liq = row.liq_price != null ? formatAmount(parseAmount(row.liq_price)) : null;
  return {
    id: row.id,
    symbol: row.symbol,
    timestamp: opened.getTime(),
    datetime: opened.toISOString(),
    side: row.side,
    contracts: formatAmount(size),
    contractSize: null,
    entryPrice: formatAmount(entry),
    markPrice: extras?.markPrice ?? null,
    notional: formatAmount(notional),
    leverage: formatAmount(leverage),
    collateral: formatAmount(margin),
    initialMargin: formatAmount(margin),
    maintenanceMargin: null,
    unrealizedPnl: null,
    realizedPnl: extras?.realizedPnl ?? null,
    liquidationPrice: liq,
    marginMode: row.margin_mode,
    percentage: null,
  };
}
