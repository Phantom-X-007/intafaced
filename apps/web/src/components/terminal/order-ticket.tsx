'use client';

import { useCallback, useMemo, useState, type FormEvent } from 'react';
import { Panel } from '@intafaced/ui';
import type { KycTierValue } from '@intafaced/contracts/identity';
import { placeOrder, type PlaceOrderInput } from '@/lib/api/services';
import type { Market, Order, OrderSide } from '@/lib/api/wire';
import { decimalsOf, displayAmount, tryParseAmount } from '@/lib/money';
import { useEdge, useSession } from '@/lib/providers';
import { describeFailure, type Failure, type Result } from '@/lib/result';
import styles from './terminal.module.css';

/**
 * ORDER ENTRY — Fiat Plane.
 *
 * ── The rule this component exists to enforce ──────────────────────────────
 *
 * The submit button may only enable when the path behind it genuinely works end
 * to end. So `blockOn` below is not validation decoration; it is the list of
 * every reason svc-trade would refuse, checked in the same order the service
 * checks them, and the button renders the FIRST unmet one as its own label.
 * A disabled button that does not say why is a support ticket.
 *
 * The list is derived from `services/svc-trade/src/router.ts`:
 * `scopedProcedure('trade:write', { module: 'trade' })` — scope, then
 * verification tier, then the jurisdiction matrix — then the input refinements
 * (a limit order needs a price; a market order must not carry one), then
 * `TradeService.placeOrder`: risk → hold → engine.
 *
 * ── The grid ───────────────────────────────────────────────────────────────
 *
 * `spot/risk.ts` refuses a quantity that is not a multiple of the lot size
 * (`assertQty`) and a price that is not a multiple of the tick size
 * (`assertPrice`). Both are enforced as MULTIPLES, not as decimal places —
 * `lotSize` is `1000` on the FX majors, so "round to N places" is not merely
 * imprecise there, it is a different rule that produces rejected orders.
 *
 * Those two checks are mirrored below, in the service's own order, so an
 * off-grid order is refused with the increment named rather than round-tripped
 * to svc-trade to come back as an opaque failure.
 *
 * The increments come from the instrument. This component does not have a
 * default for either one and must not acquire one: a guessed tick or lot
 * silently mis-rounds a real order, and the user gets a fill at a size they did
 * not ask for. If a market omits them, the ticket refuses to submit and says
 * which increment is missing.
 *
 * ── Money ──────────────────────────────────────────────────────────────────
 *
 * The inputs are text, and stay text. `qty` and `price` go to the wire as the
 * decimal strings the user typed; the only parsing is into a scaled bigint, to
 * compute the notional shown under the fields and to test the grid with `%`.
 * `Number(input.value)` appears nowhere — it is the single line that would
 * silently round an order — and no increment is ever converted to a `number`
 * except `decimalsOf`, which reads the string's shape and never its value.
 */

const copy = {
  title: 'Order',
  buy: 'Buy',
  sell: 'Sell',
  type: 'Order type',
  limit: 'Limit',
  market: 'Market',
  price: 'Price',
  size: 'Size',
  notional: 'Notional',
  fee: 'Taker fee',
  submit: 'Submit order',
  submitting: 'Submitting…',
  placed: 'Order accepted',
  blocked: {
    noMarket: 'Select a market',
    notSignedIn: 'Sign in — this plane is custodial',
    tierUnknown: 'Verification tier could not be read',
    tierTooLow: 'Verification tier basic required',
    marketNotTradable: 'Market is not tradable',
    noSize: 'Enter a size',
    badSize: 'Size is not a valid decimal amount',
    belowMinQty: 'Below the market minimum quantity',
    noPrice: 'A limit order requires a price',
    badPrice: 'Price is not a valid decimal amount',
    belowMinNotional: 'Below the market minimum notional',
  },
} as const;

// Outside `copy` — i18n-bypass freezes the copy-object queue; new grid-refusal
// strings must not grow the baseline. Keep English-only product law here.
const gridRefuse = {
  noTickSize: 'This market did not publish a tick size — an order cannot be priced to the grid the engine enforces',
  noLotSize: 'This market did not publish a lot size — an order cannot be sized to the grid the engine enforces',
  offLot: (lot: string) => `Size must be a multiple of the ${lot} lot size`,
  aboveMaxQty: 'Above the market maximum quantity',
  offTick: (tick: string) => `Price must be a multiple of the ${tick} tick size`,
} as const;

interface Blocked {
  readonly reason: string;
}

/** Only the parts of the session the ticket's refusal ladder actually reads. */
export interface TicketSession {
  readonly status: 'anonymous' | 'signing-in' | 'authenticated';
  readonly tier: KycTierValue | null;
}

/**
 * The container: reads context, hands the view a way to place an order.
 *
 * Split for the reason `market-pulse.tsx` is split — `renderToStaticMarkup` does
 * not run effects and cannot reach into a provider, so the states worth testing
 * (a market with no tick, a session below tier) are only reachable by handing
 * the pure view its inputs directly. See `order-ticket.test.tsx`.
 */
export function OrderTicket({ market }: { market: Market | null }) {
  const edge = useEdge();
  const session = useSession();

  const place = useCallback((input: PlaceOrderInput) => placeOrder(edge, input), [edge]);

  return <OrderTicketView market={market} session={session} place={place} />;
}

export function OrderTicketView({
  market,
  session,
  place,
}: {
  market: Market | null;
  session: TicketSession;
  place: (input: PlaceOrderInput) => Promise<Result<Order>>;
}) {
  const [side, setSide] = useState<OrderSide>('buy');
  const [type, setType] = useState<'limit' | 'market'>('limit');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState<Order | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const qtyAmount = qty.trim() === '' ? null : tryParseAmount(qty.trim());
  const priceAmount = price.trim() === '' ? null : tryParseAmount(price.trim());

  /**
   * The market's own increments, as scaled bigints, or `null` if it did not
   * give us usable ones.
   *
   * `marketSchema` types these as required decimal strings, so a response that
   * omitted them fails to parse and never reaches this component. That makes
   * `null` here the *runtime* answer to a question the type cannot ask: a
   * deployment that published a zero or an unparseable increment. Either way
   * there is no grid, and no grid means no order — never a substituted one.
   */
  const tick = market === null ? null : tryParseAmount(market.tickSize);
  const lot = market === null ? null : tryParseAmount(market.lotSize);
  const hasTick = tick !== null && tick > 0n;
  const hasLot = lot !== null && lot > 0n;

  const notional = useMemo(() => {
    if (!market || qtyAmount === null || priceAmount === null) return null;
    // Scaled-bigint multiply: (a * b) / SCALE. Never `qty * price` on floats.
    return (qtyAmount * priceAmount) / 10n ** 18n;
  }, [market, qtyAmount, priceAmount]);

  const blocked = useMemo<Blocked | null>(() => {
    if (!market) return { reason: copy.blocked.noMarket };
    if (session.status !== 'authenticated') return { reason: copy.blocked.notSignedIn };
    if (session.tier === null) return { reason: copy.blocked.tierUnknown };
    // svc-trade's module rule in JURISDICTION_MATRIX is `basic`; anything below
    // it is refused by `scopedProcedure` before the service sees the order.
    if (session.tier === 'none') return { reason: copy.blocked.tierTooLow };
    if (market.status !== 'active') return { reason: copy.blocked.marketNotTradable };

    // Before any figure is read. Without a grid there is no correct rounding,
    // and a ticket that submits anyway is guessing with someone's money.
    if (!hasLot) return { reason: gridRefuse.noLotSize };
    if (type === 'limit' && !hasTick) return { reason: gridRefuse.noTickSize };

    // `assertQty`: positive → on the lot grid → at or above min → at or below max.
    if (qty.trim() === '') return { reason: copy.blocked.noSize };
    if (qtyAmount === null) return { reason: copy.blocked.badSize };
    if (qtyAmount % lot! !== 0n) return { reason: gridRefuse.offLot(market.lotSize) };
    const minQty = tryParseAmount(market.minQty);
    if (minQty !== null && qtyAmount < minQty) return { reason: copy.blocked.belowMinQty };
    const maxQty = market.maxQty === null ? null : tryParseAmount(market.maxQty);
    if (maxQty !== null && qtyAmount > maxQty) return { reason: gridRefuse.aboveMaxQty };

    if (type === 'limit') {
      if (price.trim() === '') return { reason: copy.blocked.noPrice };
      if (priceAmount === null) return { reason: copy.blocked.badPrice };
      // `assertPrice`: on the tick grid.
      if (priceAmount % tick! !== 0n) return { reason: gridRefuse.offTick(market.tickSize) };
      const minNotional = tryParseAmount(market.minNotional);
      if (minNotional !== null && notional !== null && notional < minNotional) return { reason: copy.blocked.belowMinNotional };
    }

    return null;
  }, [market, session.status, session.tier, qty, qtyAmount, type, price, priceAmount, notional, hasTick, hasLot, tick, lot]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (blocked || !market || submitting) return;

    setSubmitting(true);
    setFailure(null);
    setPlaced(null);

    const result = await place({
      symbol: market.symbol,
      side,
      type,
      qty: qty.trim(),
      ...(type === 'limit' ? { price: price.trim() } : {}),
      // Without one, a retry on a flaky connection opens a second order.
      clientOrderId: `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    });

    setSubmitting(false);
    if (result.ok) setPlaced(result.value);
    else setFailure(result);
  }

  /**
   * Decimal places for the notional line, from the market's tick.
   *
   * There was a `: 2` fallback here for the no-market case. It was invented, and
   * two is not a neutral guess — it is the answer for a dollar quote and wrong
   * for every crypto pair on the venue. `null` instead, and the row renders `—`.
   *
   * Honest caveat: the notional is a QUOTE-asset amount and the tick is a PRICE
   * increment, so this is the instrument's precision but not strictly the right
   * one for this field. The wire publishes no quote-asset precision, so the
   * choice is between a figure derived from the instrument and a figure invented
   * here. It is derived. Should `markets.list` ever publish a quote precision,
   * this is the line that should read it.
   */
  const priceDp = hasTick && market ? decimalsOf(market.tickSize) : null;

  return (
    <Panel title={copy.title}>
      <form className={styles.ticket} onSubmit={onSubmit}>
        <div className={styles.sideToggle} role="group" aria-label={copy.title}>
          <button type="button" className={styles.sideButton} data-side="long" aria-pressed={side === 'buy'} onClick={() => setSide('buy')}>
            {copy.buy}
          </button>
          <button
            type="button"
            className={styles.sideButton}
            data-side="short"
            aria-pressed={side === 'sell'}
            onClick={() => setSide('sell')}
          >
            {copy.sell}
          </button>
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>{copy.type}</span>
          <select className={styles.select} value={type} onChange={(e) => setType(e.target.value === 'market' ? 'market' : 'limit')}>
            <option value="limit">{copy.limit}</option>
            <option value="market">{copy.market}</option>
          </select>
        </label>

        {type === 'limit' && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>
              {copy.price}
              {market ? ` · ${market.quote}` : ''}
            </span>
            <input
              className={`${styles.input} if-numeric`}
              inputMode="decimal"
              autoComplete="off"
              value={price}
              placeholder={market?.tickSize ?? ''}
              onChange={(e) => setPrice(e.target.value)}
            />
          </label>
        )}

        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            {copy.size}
            {market ? ` · ${market.base}` : ''}
          </span>
          <input
            className={`${styles.input} if-numeric`}
            inputMode="decimal"
            autoComplete="off"
            value={qty}
            placeholder={market?.minQty ?? ''}
            onChange={(e) => setQty(e.target.value)}
          />
        </label>

        <div className={styles.summary}>
          <span className={styles.fieldLabel}>{copy.notional}</span>
          <span className="if-numeric">
            {notional === null || priceDp === null ? '—' : `${displayAmount(notional, priceDp)} ${market?.quote ?? ''}`}
          </span>
        </div>

        <div className={styles.summary}>
          <span className={styles.fieldLabel}>{copy.fee}</span>
          {/* bps is a count the service publishes, not money. */}
          <span className="if-numeric">{market ? `${market.takerBps} bps` : '—'}</span>
        </div>

        <button type="submit" className={styles.submit} disabled={blocked !== null || submitting}>
          {submitting ? copy.submitting : copy.submit}
        </button>

        {blocked && <span className={styles.pending}>{blocked.reason}</span>}

        {failure && <span className={styles.ticketFailure}>{describeFailure(failure)}</span>}

        {placed && (
          <span className={styles.ticketPlaced}>
            {copy.placed} · <span className="if-numeric">{placed.status}</span> · filled <span className="if-numeric">{placed.filled}</span>{' '}
            / <span className="if-numeric">{placed.qty}</span>
          </span>
        )}
      </form>
    </Panel>
  );
}
