'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Panel } from '@intafaced/ui';
import { placeOrder } from '@/lib/api/services';
import type { Market, Order, OrderSide } from '@/lib/api/wire';
import { decimalsOf, displayAmount, tryParseAmount } from '@/lib/money';
import { useEdge, useSession } from '@/lib/providers';
import { describeFailure, type Failure } from '@/lib/result';
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
 * ── Money ──────────────────────────────────────────────────────────────────
 *
 * The inputs are text, and stay text. `qty` and `price` go to the wire as the
 * decimal strings the user typed; the only parsing is into a scaled bigint, to
 * compute the notional shown under the fields. `Number(input.value)` appears
 * nowhere — it is the single line that would silently round an order.
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

interface Blocked {
  readonly reason: string;
}

export function OrderTicket({ market }: { market: Market | null }) {
  const edge = useEdge();
  const session = useSession();

  const [side, setSide] = useState<OrderSide>('buy');
  const [type, setType] = useState<'limit' | 'market'>('limit');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState<Order | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const qtyAmount = qty.trim() === '' ? null : tryParseAmount(qty.trim());
  const priceAmount = price.trim() === '' ? null : tryParseAmount(price.trim());

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

    if (qty.trim() === '') return { reason: copy.blocked.noSize };
    if (qtyAmount === null) return { reason: copy.blocked.badSize };
    const minQty = tryParseAmount(market.minQty);
    if (minQty !== null && qtyAmount < minQty) return { reason: copy.blocked.belowMinQty };

    if (type === 'limit') {
      if (price.trim() === '') return { reason: copy.blocked.noPrice };
      if (priceAmount === null) return { reason: copy.blocked.badPrice };
      const minNotional = tryParseAmount(market.minNotional);
      if (minNotional !== null && notional !== null && notional < minNotional) return { reason: copy.blocked.belowMinNotional };
    }

    return null;
  }, [market, session.status, session.tier, qty, qtyAmount, type, price, priceAmount, notional]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (blocked || !market || submitting) return;

    setSubmitting(true);
    setFailure(null);
    setPlaced(null);

    const result = await placeOrder(edge, {
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

  const priceDp = market ? decimalsOf(market.tickSize) : 2;

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
          <span className="if-numeric">{notional === null ? '—' : `${displayAmount(notional, priceDp)} ${market?.quote ?? ''}`}</span>
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
