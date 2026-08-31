import type { Principal } from '@intafaced/auth';
import type { FastifyInstance } from 'fastify';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import { TradeError } from './types.js';
import { TradeService, type PlaceOrderInput } from './trade-service.js';
import type { EngineSubmitRequest } from './matching-client.js';

/**
 * Place an option through the matching door that landed in #3484.
 * Same strike and expiry. Refuse if strike or expiry is missing.
 * Trade does not invent a mark.
 */

type PlaceWithOption = PlaceOrderInput & {
  type?: PlaceOrderInput['type'] | 'option';
  strike?: Amount | null;
  expiry?: string | null;
};

const FLAG = Symbol.for('intafaced.trade.optionPlace');
const stash = new Map<string, { strike: string | null; expiry: string | null }>();

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

function readStrike(rec: { readonly strike?: Amount | null }): Amount | null {
  if (rec.strike === undefined) return null;
  return rec.strike ?? null;
}

function readExpiry(rec: { readonly expiry?: string | null }): string | null {
  if (rec.expiry === undefined || rec.expiry === null) return null;
  const expiry = rec.expiry.trim();
  return expiry.length === 0 ? null : expiry;
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
      if (wantsOption(rec)) {
        stash.set(stashKey(rec), {
          strike: rec.strike == null || rec.strike === '' ? null : String(rec.strike),
          expiry: rec.expiry == null || rec.expiry === '' ? null : String(rec.expiry),
        });
      }
    }
    done();
  });
}

export function bindOption(input: PlaceOrderInput): PlaceWithOption {
  const extra = input as PlaceWithOption;
  if (wantsOption(extra as unknown as Record<string, unknown>)) {
    const placeType = extra.type === 'option' ? 'limit' : extra.type;
    return { ...extra, type: placeType, strike: readStrike(extra), expiry: readExpiry(extra) };
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
  };
}

export function installOptionPlace(ctor: typeof TradeService): void {
  const proto = ctor.prototype as unknown as {
    placeOrder: (principal: Principal, input: PlaceOrderInput) => Promise<{ id: string; status: string }>;
    toEngineRequest: (...args: unknown[]) => EngineSubmitRequest;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  const origPlace = proto.placeOrder;
  proto.placeOrder = async function (this: TradeService, principal: Principal, input: PlaceOrderInput) {
    const bound = bindOption(input);
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
    if (input && (input.strike !== undefined || input.expiry !== undefined || input.type === 'option')) {
      return {
        ...req,
        type: 'option',
        strike: input.strike == null ? null : formatAmount(input.strike),
        expiry: input.expiry ?? null,
      };
    }
    return req;
  };
}

installOptionPlace(TradeService);
