import type { Principal } from '@intafaced/auth';
import type { FastifyInstance } from 'fastify';
import { formatAmount, parseAmount, type Amount } from '@intafaced/ledger-client';
import { TradeError } from './types.js';
import { TradeService, type PlaceOrderInput } from './trade-service.js';
import type { EngineSubmitRequest } from './matching-client.js';

/**
 * Place an iceberg through the matching door that landed in #3282.
 * Only the display qty is visible. Hidden remainder refills as display takes.
 * Trade does not invent a display.
 */

type PlaceWithIceberg = PlaceOrderInput & { iceberg?: boolean; displayQty?: Amount | null };

const FLAG = Symbol.for('intafaced.trade.icebergPlace');
const stash = new Map<string, { displayQty: string | null }>();

export const ICEBERG_DISPLAY_MISSING = 'iceberg_display_missing' as const;
export const ICEBERG_DISPLAY_NOT_SMALLER = 'iceberg_display_not_smaller' as const;

function stashKey(rec: Record<string, unknown>): string {
  const client = rec.clientOrderId;
  if (typeof client === 'string' && client.length > 0) return client;
  return `__ice:${String(rec.symbol ?? '')}:${String(rec.side ?? '')}:${String(rec.type ?? '')}:${String(rec.amount ?? rec.qty ?? '')}:${String(rec.price ?? '')}`;
}

function wantsIceberg(rec: Record<string, unknown>): boolean {
  return rec.iceberg === true || rec.displayQty !== undefined;
}

function readDisplay(raw: unknown): Amount | null {
  if (raw == null) return null;
  if (typeof raw === 'string' && raw.trim() === '') return null;
  try {
    const qty = typeof raw === 'string' || typeof raw === 'number' ? parseAmount(String(raw)) : (raw as Amount);
    return qty;
  } catch {
    return null;
  }
}

export function icebergDisplayRefuse(qty: Amount, displayQty: Amount | null): TradeError | null {
  if (displayQty === null || displayQty <= (0n as Amount)) {
    return new TradeError('iceberg requires a display qty; trade does not invent a display', 'trade.iceberg_display_missing');
  }
  if (displayQty >= qty) {
    return new TradeError(
      'iceberg display must be smaller than total; trade does not invent a display',
      'trade.iceberg_display_not_smaller',
    );
  }
  return null;
}

export function attachIcebergStash(app: FastifyInstance): void {
  app.addHook('preValidation', (req, _reply, done) => {
    const body = req.body;
    if (body && typeof body === 'object') {
      const rec = body as Record<string, unknown>;
      if (wantsIceberg(rec)) {
        const display = rec.displayQty;
        stash.set(stashKey(rec), {
          displayQty: display == null || display === '' ? null : String(display),
        });
      }
    }
    done();
  });
}

export function bindIceberg(input: PlaceOrderInput): PlaceWithIceberg {
  const extra = input as PlaceWithIceberg;
  if (extra.iceberg === true || extra.displayQty !== undefined) {
    return { ...extra, iceberg: true, displayQty: extra.displayQty ?? null };
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
  return { ...extra, iceberg: true, displayQty: hit.displayQty == null ? null : parseAmount(hit.displayQty) };
}

export function installIcebergPlace(ctor: typeof TradeService): void {
  const proto = ctor.prototype as unknown as {
    placeOrder: (principal: Principal, input: PlaceOrderInput) => Promise<{ id: string; status: string }>;
    toEngineRequest: (...args: unknown[]) => EngineSubmitRequest;
    [FLAG]?: true;
  };
  if (proto[FLAG]) return;
  proto[FLAG] = true;

  const origPlace = proto.placeOrder;
  proto.placeOrder = async function (this: TradeService, principal: Principal, input: PlaceOrderInput) {
    const bound = bindIceberg(input);
    if (bound.iceberg === true || bound.displayQty !== undefined) {
      const refuse = icebergDisplayRefuse(bound.qty, bound.displayQty ?? null);
      if (refuse) throw refuse;
      if (bound.type === 'limit' && bound.price == null) {
        throw new TradeError('iceberg requires a limit price; trade does not invent a display', 'trade.invalid_tif');
      }
    }
    return origPlace.call(this, principal, bound);
  };

  const origToEngine = proto.toEngineRequest;
  proto.toEngineRequest = function (this: TradeService, ...args: unknown[]) {
    const req = origToEngine.apply(this, args);
    const input = args[2] as PlaceWithIceberg | undefined;
    if (input?.iceberg === true || input?.displayQty !== undefined) {
      return {
        ...req,
        iceberg: true,
        displayQty: input.displayQty == null ? null : formatAmount(input.displayQty),
      };
    }
    return req;
  };
}

installIcebergPlace(TradeService);
