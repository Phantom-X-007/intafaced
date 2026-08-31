import type { Principal } from '@intafaced/auth';
import type { FastifyInstance } from 'fastify';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import { TradeError } from './types.js';
import { TradeService, type PlaceOrderInput } from './trade-service.js';
import type { EngineCancellation, EngineFill, EngineSubmitRequest } from './matching-client.js';
import type { Market } from './types.js';

/**
 * Place an option through the matching door that landed in #3484.
 * Same strike and expiry. Refuse if strike or expiry is missing.
 * Exercise a long option at strike through that door.
 * Cover a short option after assignment through that door.
 * Expire a resting option at expiry through matching. Unfilled remainder leaves the book.
 * Trade does not invent a mark or a clock.
 */

type PlaceWithOption = PlaceOrderInput & {
  type?: PlaceOrderInput['type'] | 'option';
  strike?: Amount | null;
  expiry?: string | null;
  exercise?: boolean;
  cover?: boolean;
  now?: string | null;
};

const FLAG = Symbol.for('intafaced.trade.optionPlace');
const stash = new Map<
  string,
  { strike: string | null; expiry: string | null; exercise?: boolean; cover?: boolean; now?: string | null }
>();

export const STRIKE_MISSING = 'missing_strike' as const;
export const EXPIRY_MISSING = 'missing_expiry' as const;

function stashKey(rec: Record<string, unknown>): string {
  const client = rec.clientOrderId;
  if (typeof client === 'string' && client.length > 0) return client;
  return `__opt:${String(rec.symbol ?? '')}:${String(rec.side ?? '')}:${String(rec.type ?? '')}:${String(rec.amount ?? rec.qty ?? '')}:${String(rec.price ?? '')}`;
}

function wantsOption(rec: Record<string, unknown>): boolean {
  return rec.type === 'option' || rec.strike !== undefined || rec.expiry !== undefined;
}

export function wantsExercise(rec: { readonly exercise?: boolean }): boolean {
  return rec.exercise === true;
}

export function wantsCover(rec: { readonly cover?: boolean }): boolean {
  return rec.cover === true;
}

function readStrike(rec: { readonly strike?: Amount | null }): Amount | null {
  if (rec.strike === undefined) return null;
  return rec.strike ?? null;
}

function readExpiry(rec: { readonly expiry?: string | null }): string | null {
  if (rec.expiry === undefined || rec.expiry === null) return null;
  const expiry = rec.expiry.trim();
  return expiry.length === 0 ? null : expiry;
}

/** Caller clock. Null/blank is omitted — never invent from mark or wall time. */
function readNow(rec: { readonly now?: string | Date | null }): string | null {
  if (rec.now === undefined || rec.now === null) return null;
  if (rec.now instanceof Date) {
    const ms = rec.now.getTime();
    return Number.isFinite(ms) ? rec.now.toISOString() : null;
  }
  const now = String(rec.now).trim();
  return now.length === 0 ? null : now;
}

export function strikeRefuse(strike: Amount | null): TradeError | null {
  if (strike === null || strike <= (0n as Amount)) {
    return new TradeError(
      'an option requires a strike; trade does not invent a mark',
      'trade.missing_strike',
    );
  }
  return null;
}

export function expiryRefuse(expiry: string | null): TradeError | null {
  if (expiry === null || expiry.length === 0) {
    return new TradeError(
      'an option requires an expiry; trade does not invent a mark',
      'trade.missing_expiry',
    );
  }
  return null;
}

export function attachOptionStash(app: FastifyInstance): void {
  app.addHook('preValidation', (req, _reply, done) => {
    const body = req.body;
    if (body && typeof body === 'object') {
      const rec = body as Record<string, unknown>;
      if (wantsOption(rec) || rec.exercise === true || rec.cover === true || rec.now != null) {
        stash.set(stashKey(rec), {
          strike: rec.strike == null || rec.strike === '' ? null : String(rec.strike),
          expiry: rec.expiry == null || rec.expiry === '' ? null : String(rec.expiry),
          exercise: rec.exercise === true,
          cover: rec.cover === true,
          now: rec.now == null || rec.now === '' ? null : String(rec.now),
        });
      }
    }
    done();
  });
}

export function bindOption(input: PlaceOrderInput): PlaceWithOption {
  const extra = input as PlaceWithOption;
  if (wantsOption(extra as unknown as Record<string, unknown>) || extra.exercise === true || extra.cover === true) {
    const placeType = extra.type === 'option' ? 'limit' : extra.type;
    return {
      ...extra,
      type: placeType,
      strike: readStrike(extra),
      expiry: readExpiry(extra),
      now: readNow(extra),
      ...(extra.exercise === true ? { exercise: true } : {}),
      ...(extra.cover === true ? { cover: true } : {}),
    };
  }
  if (extra.now != null) {
    return { ...extra, now: readNow(extra) };
  }
  const rec = extra as unknown as Record<string, unknown>;
  const key = stashKey({
    clientOrderId: extra.clientOrderId,
    symbol: rec.symbol,
    side: extra.side,
    type: extra.type,
    amount: rec.amount,
    qty: rec.qty,
    price: extra.price,
  });
  const hit = stash.get(key);
  if (!hit) return extra;
  stash.delete(key);
  return {
    ...extra,
    type: extra.type === 'option' ? 'limit' : extra.type,
    strike: hit.strike == null ? null : parseAmount(hit.strike),
    expiry: hit.expiry,
    now: hit.now ?? null,
    ...(hit.exercise === true ? { exercise: true } : {}),
    ...(hit.cover === true ? { cover: true } : {}),
  };
}

function withNow(req: EngineSubmitRequest, now: string | null): EngineSubmitRequest {
  if (now == null) return req;
  return { ...req, now } as EngineSubmitRequest;
}

export function installOptionPlace(ctor: typeof TradeService): void {
  const proto = ctor.prototype as unknown as {
    placeOrder: (principal: Principal, input: PlaceOrderInput) => Promise<{ id: string; status: string }>;
    toEngineRequest: (...args: unknown[]) => EngineSubmitRequest;
    settleOutcome: (market: Market, fills: readonly EngineFill[], cancellations: readonly EngineCancellation[]) => Promise<void>;
    finalize: (orderId: string, status: 'cancelled' | 'filled' | 'expired' | 'rejected') => Promise<void>;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  const origPlace = proto.placeOrder;
  proto.placeOrder = async function (this: TradeService, principal: Principal, input: PlaceOrderInput) {
    const bound = bindOption(input);
    const covering = bound.cover === true || (input as PlaceWithOption).cover === true;
    if (covering) {
      const missingStrike = strikeRefuse(bound.strike ?? null);
      if (missingStrike) throw missingStrike;
      const missingExpiry = expiryRefuse(bound.expiry ?? null);
      if (missingExpiry) throw missingExpiry;
      const priced =
        bound.price == null && bound.strike != null && bound.strike > (0n as Amount)
          ? { ...bound, cover: true as const, price: bound.strike }
          : { ...bound, cover: true as const };
      return origPlace.call(this, principal, priced);
    }
    const exercising = bound.exercise === true || (input as PlaceWithOption).exercise === true;
    if (exercising) {
      const missingStrike = strikeRefuse(bound.strike ?? null);
      if (missingStrike) throw missingStrike;
      const missingExpiry = expiryRefuse(bound.expiry ?? null);
      if (missingExpiry) throw missingExpiry;
      const priced =
        bound.price == null && bound.strike != null && bound.strike > (0n as Amount)
          ? { ...bound, exercise: true as const, price: bound.strike }
          : { ...bound, exercise: true as const };
      return origPlace.call(this, principal, priced);
    }
    if (bound.strike !== undefined || bound.expiry !== undefined || (input as PlaceWithOption).type === 'option') {
      const missingStrike = strikeRefuse(bound.strike ?? null);
      if (missingStrike) throw missingStrike;
      const missingExpiry = expiryRefuse(bound.expiry ?? null);
      if (missingExpiry) throw missingExpiry;
      if (bound.price == null) {
        throw new TradeError(
          'an option rests as a limit; trade does not invent a mark',
          'trade.missing_price',
        );
      }
    }
    return origPlace.call(this, principal, bound);
  };

  const origToEngine = proto.toEngineRequest;
  proto.toEngineRequest = function (this: TradeService, ...args: unknown[]) {
    const req = origToEngine.apply(this, args);
    const input = args[2] as PlaceWithOption | undefined;
    const now = input ? readNow(input) : null;
    if (input && input.cover === true) {
      const { mark: _mark, ...rest } = req as EngineSubmitRequest & { mark?: string | null };
      return withNow(
        {
          ...rest,
          cover: true,
          strike: input.strike == null ? null : formatAmount(input.strike),
          expiry: input.expiry ?? null,
        } as EngineSubmitRequest,
        now,
      );
    }
    if (input && input.exercise === true) {
      const { mark: _mark, ...rest } = req as EngineSubmitRequest & { mark?: string | null };
      return withNow(
        {
          ...rest,
          exercise: true,
          strike: input.strike == null ? null : formatAmount(input.strike),
          expiry: input.expiry ?? null,
        },
        now,
      );
    }
    if (input && (input.strike !== undefined || input.expiry !== undefined || input.type === 'option')) {
      const { mark: _mark, ...rest } = req as EngineSubmitRequest & { mark?: string | null };
      return withNow(
        {
          ...rest,
          type: 'option',
          strike: input.strike == null ? null : formatAmount(input.strike),
          expiry: input.expiry ?? null,
        },
        now,
      );
    }
    return withNow(req, now);
  };

  const origSettle = proto.settleOutcome;
  proto.settleOutcome = async function (
    this: TradeService,
    market: Market,
    fills: readonly EngineFill[],
    cancellations: readonly EngineCancellation[],
  ) {
    const expired: EngineCancellation[] = [];
    const rest: EngineCancellation[] = [];
    for (const c of cancellations) {
      if (c.reason === 'expired') expired.push(c);
      else rest.push(c);
    }
    await origSettle.call(this, market, fills, rest);
    for (const c of expired) {
      await proto.finalize.call(this, c.orderId, 'expired');
    }
  };
}

installOptionPlace(TradeService);
