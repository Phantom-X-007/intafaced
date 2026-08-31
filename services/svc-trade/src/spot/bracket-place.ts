/**
 * Place a linked bracket with entry, take-profit, and stop-loss through matching (#3658).
 * One submit. Entry fill rests the exits. Refuse if any leg is missing.
 * Trade does not invent a trigger.
 * Installed onto TradeService.prototype so trade-service.ts never moves.
 * Not a redo of #3658 (matching rest) or #3634 (OCO place).
 */
import type { Principal } from '@intafaced/auth';
import type { FastifyInstance } from 'fastify';
import { ZERO, formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import { TradeError } from './types.js';
import { TradeService, type PlaceOrderInput } from './trade-service.js';
import type { EngineSubmitRequest } from './matching-client.js';

export type BracketLeg = {
  readonly price?: string;
  readonly stopPrice: string;
};

export type PlaceWithBracket = PlaceOrderInput & {
  bracket?: boolean;
  takeProfit?: Amount | BracketLeg | string | null;
  stopLoss?: Amount | BracketLeg | string | null;
};

const FLAG = Symbol.for('intafaced.trade.bracketPlace');
const stash = new Map<string, { takeProfit: BracketLeg; stopLoss: BracketLeg }>();

function clientKey(rec: Record<string, unknown>): string | null {
  return typeof rec.clientOrderId === 'string' && rec.clientOrderId.length > 0 ? rec.clientOrderId : null;
}

function asLeg(raw: unknown): BracketLeg | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'bigint') {
    const stopPrice = String(raw).trim();
    return stopPrice.length > 0 ? { stopPrice } : null;
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const stop =
    typeof rec.stopPrice === 'string'
      ? rec.stopPrice
      : typeof rec.price === 'string'
        ? rec.price
        : '';
  if (stop.length === 0) return null;
  const leg: BracketLeg = { stopPrice: stop };
  if (typeof rec.price === 'string' && rec.price.length > 0) return { ...leg, price: rec.price };
  return leg;
}

function triggerOf(raw: unknown): Amount | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'bigint') return raw <= ZERO ? null : (raw as Amount);
  const leg = asLeg(raw);
  if (!leg) return null;
  try {
    const qty = parseAmount(leg.stopPrice);
    if (qty <= ZERO) return null;
    return qty;
  } catch {
    return null;
  }
}

export function wantsBracket(rec: { readonly bracket?: boolean }): boolean {
  return rec.bracket === true;
}

export function readEntry(order: { readonly type?: string; readonly price?: Amount | null }): Amount | null {
  if (order.type === 'market') return null;
  if (order.price === undefined || order.price === null || order.price <= ZERO) return null;
  return order.price;
}

export function entryRefuse(order: { readonly type?: string; readonly price?: Amount | null }): TradeError | null {
  if (order.type === 'market') return null;
  if (readEntry(order) !== null) return null;
  return new TradeError('a bracket entry is missing; trade does not invent a trigger', 'trade.missing_price');
}

export function takeProfitRefuse(takeProfit: Amount | null): TradeError | null {
  if (takeProfit !== null) return null;
  return new TradeError('a bracket take-profit is missing; trade does not invent a trigger', 'trade.missing_stop_price');
}

export function stopLossRefuse(stopLoss: Amount | null): TradeError | null {
  if (stopLoss !== null) return null;
  return new TradeError('a bracket stop-loss is missing; trade does not invent a trigger', 'trade.missing_stop_price');
}

export function stashBracketFromBody(rec: Record<string, unknown>): void {
  if (rec.bracket !== true) return;
  const takeProfit = asLeg(rec.takeProfit);
  const stopLoss = asLeg(rec.stopLoss);
  delete rec.takeProfit;
  delete rec.stopLoss;
  delete rec.bracket;
  const key = clientKey(rec);
  if (!key) return;
  stash.set(key, {
    takeProfit: takeProfit ?? { stopPrice: '' },
    stopLoss: stopLoss ?? { stopPrice: '' },
  });
}

export function bindBracket(input: PlaceOrderInput): PlaceWithBracket {
  const extra = input as PlaceWithBracket;
  if (wantsBracket(extra)) return extra;
  const key = extra.clientOrderId;
  if (!key) return extra;
  const stashed = stash.get(key);
  if (!stashed) return extra;
  stash.delete(key);
  return { ...extra, bracket: true, takeProfit: stashed.takeProfit, stopLoss: stashed.stopLoss };
}

export function attachBracketStash(app: FastifyInstance): void {
  app.addHook('preValidation', (req, _reply, done) => {
    const body = req.body;
    if (body && typeof body === 'object') stashBracketFromBody(body as Record<string, unknown>);
    done();
  });
}

export function installBracketPlace(ctor: typeof TradeService): void {
  const proto = ctor.prototype as unknown as {
    placeOrder: (principal: Principal, input: PlaceOrderInput) => Promise<{ id: string; status: string; rejectCode?: string }>;
    toEngineRequest: (...args: unknown[]) => EngineSubmitRequest;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  const origPlace = proto.placeOrder;
  proto.placeOrder = async function (this: TradeService, principal: Principal, input: PlaceOrderInput) {
    const bound = bindBracket(input);
    if (!wantsBracket(bound)) return origPlace.call(this, principal, bound);
    const missingEntry = entryRefuse(bound);
    if (missingEntry) throw missingEntry;
    const missingTp = takeProfitRefuse(triggerOf(bound.takeProfit));
    if (missingTp) throw missingTp;
    const missingSl = stopLossRefuse(triggerOf(bound.stopLoss));
    if (missingSl) throw missingSl;
    return origPlace.call(this, principal, bound);
  };

  const origToEngine = proto.toEngineRequest;
  proto.toEngineRequest = function (this: TradeService, ...args: unknown[]) {
    const req = origToEngine.apply(this, args);
    const extra = args[2] as PlaceWithBracket | undefined;
    if (!extra || !wantsBracket(extra)) return req;
    const takeProfit = triggerOf(extra.takeProfit);
    const stopLoss = triggerOf(extra.stopLoss);
    return {
      ...req,
      bracket: true,
      takeProfit: takeProfit == null ? null : formatAmount(takeProfit),
      stopLoss: stopLoss == null ? null : formatAmount(stopLoss),
    } as EngineSubmitRequest;
  };
}

installBracketPlace(TradeService);
