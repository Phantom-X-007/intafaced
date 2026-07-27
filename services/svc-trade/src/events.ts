import { MemorySeenStore, idempotent, type EventBus, type SeenStore, type Subscription } from '@intafaced/events';
import type { TradeService } from './spot/trade-service.js';

/**
 * EVENT WIRING (§10, §5.2 step 3).
 *
 * svc-matching publishes every match and every departure from the book to
 * `intafaced.matching.*` whether or not the submitting request survived. These
 * consumers are the recovery path for exactly that case: a process that died
 * between the engine printing a fill and this service settling it heals when
 * the event is delivered.
 *
 * Both handlers are idempotent twice over — `idempotent()` here, and business
 * keys underneath (`trade.fill:<market>:<sequence>` at the ledger, a unique
 * index on the fills table, and a fixed release key per order). That is
 * deliberate belt and braces: at-least-once is the only delivery there is, and
 * a redelivered fill that settled twice would pay a counterparty out of a hold
 * that only funded one trade.
 *
 * This service publishes NO subject of its own. `intafaced.trade.*` does not
 * exist in `packages/events/src/catalog.ts`, and adding one is a contracts PR
 * that comes first (§15.2) — so the only thing emitted from here is
 * `intafaced.identity.xp.earned`, which the catalog already declares and which
 * §5.2 asks for per filled order.
 */
export async function subscribeMatchingEvents(
  bus: EventBus,
  trade: TradeService,
  store: SeenStore = new MemorySeenStore(),
): Promise<Subscription[]> {
  const filled = await bus.subscribe(
    'orderFilled',
    idempotent(
      async (payload) => {
        await trade.settleFillEvent({
          marketId: payload.marketId,
          makerOrderId: payload.makerOrderId,
          takerOrderId: payload.takerOrderId,
          price: payload.price,
          qty: payload.qty,
          sequence: payload.sequence,
        });
      },
      store,
      'svc-trade',
    ),
    { durable: 'trade-fills' },
  );

  const cancelled = await bus.subscribe(
    'orderCancelled',
    idempotent(
      async (payload) => {
        // Requested cancel, IOC remainder, market remainder, self-trade
        // prevention — §5.1 unifies all four into this subject because the
        // product layer does the same thing with all four: release what is
        // left of the hold.
        await trade.releaseOnCancelEvent(payload.orderId);
      },
      store,
      'svc-trade',
    ),
    { durable: 'trade-cancels' },
  );

  return [filled, cancelled];
}
