/**
 * Public HTTP doors hitch G-data refuses onto the live tape.
 * svc-ws holds no EDGE_PRINCIPAL_SECRET. C4 L2 SBE and TradeHub stay the
 * sold product. Never withdrawHold. sbe-l2-tape / trade/hub / routes.ts
 * are not recut.
 */
import type { FastifyInstance } from 'fastify';
import { refuseLiveTapeData, type TapeLabelRefusal } from './tape-label-refuse.js';

export type TapeLabelDoorBody = {
  readonly complete?: boolean;
  readonly kind?: string | null;
  readonly label?: string | null;
  readonly origin?: string | null;
  readonly native?: boolean;
  readonly synthetic?: boolean;
  readonly implied?: boolean;
  readonly connected?: boolean;
  readonly depth?: boolean;
  readonly tradesBus?: boolean;
  readonly privateBus?: boolean;
  readonly listedMarketId?: string | null;
  readonly adapterMarketId?: string | null;
  readonly remap?: boolean;
  readonly book?: string | null;
  readonly as?: string | null;
  readonly channel?: string | null;
};

export function handleTapeLabelDoor(body: TapeLabelDoorBody): TapeLabelRefusal | { readonly ok: true } {
  const extra = refuseLiveTapeData(body);
  if (extra) return extra;
  return { ok: true };
}

export function registerTapeLabelDoor(app: FastifyInstance): void {
  app.post('/ws/tape/label-claim', async (req, reply) => {
    return reply.send(handleTapeLabelDoor({ ...(req.body ?? {}), complete: true } as TapeLabelDoorBody));
  });

  app.post('/ws/tape/origin-claim', async (req, reply) => {
    return reply.send(handleTapeLabelDoor((req.body ?? {}) as TapeLabelDoorBody));
  });

  app.post('/ws/tape/connected-claim', async (req, reply) => {
    return reply.send(handleTapeLabelDoor({ ...(req.body ?? {}), connected: true } as TapeLabelDoorBody));
  });

  app.post('/ws/tape/instrument-map', async (req, reply) => {
    return reply.send(handleTapeLabelDoor((req.body ?? {}) as TapeLabelDoorBody));
  });
}
