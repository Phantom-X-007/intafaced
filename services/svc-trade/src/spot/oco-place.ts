/**
 * Rest linked TP+SL (OCO) as one user move through the matching door
 * that landed in #3231.
 *
 * Matching owns the pair: first fill cancels the sibling.
 * Both stopPrices are the caller's. Trade does not invent a trigger.
 * Installed onto TradeService.prototype so trade-service.ts never moves.
 */
import type { Principal } from '@intafaced/auth';
import { parseAmount } from '@intafaced/ledger-client';
import { TradeError } from './types.js';
import { orderIdFor } from './ids.js';
import { TradeService, type PlaceOrderInput } from './trade-service.js';
import type { EngineSubmitRequest } from './matching-client.js';

export type OcoLeg = {
  readonly price?: string;
  readonly stopPrice: string;
};

export type PlaceWithOco = PlaceOrderInput & {
  takeProfit?: OcoLeg;
  stopLoss?: OcoLeg;
  stopPrice?: string;
  ocoSiblingId?: string;
  engineType?: 'stop' | 'stop_limit';
};

const FLAG = Symbol.for('intafaced.trade.ocoPlace');
const ocoByClient = new Map<string, { takeProfit: OcoLeg; stopLoss: OcoLeg }>();

function clientKey(rec: Record<string, unknown>): string | null {
  return typeof rec.clientOrderId === 'string' && rec.clientOrderId.length > 0 ? rec.clientOrderId : null;
}

function asLeg(raw: unknown): OcoLeg | null {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.stopPrice !== 'string' || rec.stopPrice.length === 0) return null;
  const leg: OcoLeg = { stopPrice: rec.stopPrice };
  if (typeof rec.price === 'string' && rec.price.length > 0) return { ...leg, price: rec.price };
  return leg;
}

export function stashOcoFromBody(rec: Record<string, unknown>): void {
  if (rec.takeProfit == null && rec.stopLoss == null) return;
  const takeProfit = asLeg(rec.takeProfit);
  const stopLoss = asLeg(rec.stopLoss);
  delete rec.takeProfit;
  delete rec.stopLoss;
  const key = clientKey(rec);
  if (!key) return;
  ocoByClient.set(key, {
    takeProfit: takeProfit ?? { stopPrice: '' },
    stopLoss: stopLoss ?? { stopPrice: '' },
  });
}

export function bindOco(input: PlaceOrderInput): PlaceWithOco {
  const extra = input as PlaceWithOco;
  if (extra.takeProfit && extra.stopLoss) return extra;
  const key = extra.clientOrderId;
  if (!key) return extra;
  const stashed = ocoByClient.get(key);
  if (!stashed) return extra;
  ocoByClient.delete(key);
  return { ...extra, ...stashed };
}

function requireTrigger(leg: OcoLeg | undefined, name: string): string {
  const stop = leg && typeof leg.stopPrice === 'string' ? leg.stopPrice : '';
  if (!stop) {
    throw new TradeError(`${name} requires stopPrice; trade does not invent a trigger`, 'trade.missing_oco_trigger');
  }
  return stop;
}

export function installOcoPlace(ctor: typeof TradeService): void {
  const proto = ctor.prototype as unknown as {
    placeOrder: (principal: Principal, input: PlaceOrderInput) => Promise<{ id: string; status: string; rejectCode?: string }>;
    cancelOrder: (principal: Principal, orderId: string) => Promise<unknown>;
    marketById: (id: string) => Promise<{ id: string } | null>;
    marketBySymbol: (symbol: string) => Promise<{ id: string } | null>;
    toEngineRequest: (...args: unknown[]) => EngineSubmitRequest;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  const origPlace = proto.placeOrder;
  const origToEngine = proto.toEngineRequest;

  proto.placeOrder = async function (this: TradeService, principal: Principal, input: PlaceOrderInput) {
    const bound = bindOco(input);
    if (!bound.takeProfit && !bound.stopLoss) {
      return origPlace.call(this, principal, bound);
    }
    if (!bound.takeProfit || !bound.stopLoss) {
      throw new TradeError('OCO is one user move: takeProfit and stopLoss are both required', 'trade.missing_oco_trigger');
    }
    const tpStop = requireTrigger(bound.takeProfit, 'takeProfit');
    const slStop = requireTrigger(bound.stopLoss, 'stopLoss');
    const base = bound.clientOrderId;
    if (!base) {
      throw new TradeError('clientOrderId is required so a retry cannot open a second hold', 'trade.client_order_id_required');
    }
    if (base.length > 61) {
      throw new TradeError('clientOrderId is too long to rest both OCO legs', 'trade.client_order_id_required');
    }

    const market = bound.marketId
      ? await proto.marketById.call(this, bound.marketId)
      : bound.symbol
        ? await proto.marketBySymbol.call(this, bound.symbol)
        : null;
    if (!market) {
      throw new TradeError(`market ${bound.symbol ?? bound.marketId ?? '(unspecified)'} not found`, 'trade.market_not_found');
    }

    const tpClient = `${base}:tp`;
    const slClient = `${base}:sl`;
    const slId = orderIdFor(principal.userId, market.id, slClient);
    const tpPrice = bound.takeProfit.price ?? tpStop;
    const slPrice = bound.stopLoss.price ?? slStop;

    const tpInput: PlaceWithOco = {
      ...bound,
      type: 'limit',
      price: parseAmount(tpPrice),
      clientOrderId: tpClient,
      stopPrice: tpStop,
      engineType: 'stop_limit',
      ocoSiblingId: slId,
    };
    delete (tpInput as { takeProfit?: unknown }).takeProfit;
    delete (tpInput as { stopLoss?: unknown }).stopLoss;

    const tp = await origPlace.call(this, principal, tpInput);
    if (tp.status === 'rejected') return tp;

    const slInput: PlaceWithOco = {
      ...bound,
      type: 'limit',
      price: parseAmount(slPrice),
      clientOrderId: slClient,
      stopPrice: slStop,
      engineType: bound.stopLoss.price ? 'stop_limit' : 'stop',
      ocoSiblingId: tp.id,
    };
    delete (slInput as { takeProfit?: unknown }).takeProfit;
    delete (slInput as { stopLoss?: unknown }).stopLoss;

    try {
      const sl = await origPlace.call(this, principal, slInput);
      if (sl.status === 'rejected') {
        await proto.cancelOrder.call(this, principal, tp.id);
      }
      return Object.assign(tp, { ocoSiblingId: sl.id, takeProfit: tp, stopLoss: sl });
    } catch (err) {
      await proto.cancelOrder.call(this, principal, tp.id).catch(() => undefined);
      throw err;
    }
  };

  proto.toEngineRequest = function (this: TradeService, ...args: unknown[]) {
    const req = origToEngine.apply(this, args);
    const extra = args[2] as PlaceWithOco | undefined;
    if (!extra?.ocoSiblingId || !extra.stopPrice) return req;
    return {
      ...req,
      ocoSiblingId: extra.ocoSiblingId,
      stopPrice: extra.stopPrice,
      type: extra.engineType ?? 'stop_limit',
      ...(extra.engineType === 'stop' ? { price: null } : {}),
    } as EngineSubmitRequest;
  };
}

installOcoPlace(TradeService);
