/**
 * Live HTTP door: worst-case pre-trade risk refuses if buying-power path unset.
 * Live slice stays oms-slice.ts (twap|vwap|pov). This door never slices.
 * router.ts is not recut. Paper stays paper. No invented buying power.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  refuseUnsetBuyingPower,
  type OmsBuyingPowerRefusal,
} from './oms-buying-power.js';

export type OmsBuyingPowerDoorBody = {
  readonly buyingPower?: string | null;
};

export type OmsBuyingPowerDoorOk = {
  readonly ok: true;
  readonly buyingPower: string;
};

export type OmsBuyingPowerDoorResult = OmsBuyingPowerDoorOk | OmsBuyingPowerRefusal;

export type OmsBuyingPowerDoorDeps = {
  readonly edgeContext: (req: { headers: FastifyRequest['headers']; id: string }) => {
    principal?: { userId?: string; scopes?: readonly string[] } | null;
  };
};

function hasAdminWrite(principal: { scopes?: readonly string[] } | null | undefined): boolean {
  return Boolean(principal?.scopes?.includes('admin:write'));
}

/** Pure door — tests call this. Missing/blank/invalid buying power refuses. Never slices. */
export function handleOmsBuyingPowerDoor(body: OmsBuyingPowerDoorBody): OmsBuyingPowerDoorResult {
  return refuseUnsetBuyingPower(body.buyingPower);
}

export function registerOmsBuyingPowerDoor(app: FastifyInstance, deps: OmsBuyingPowerDoorDeps): void {
  app.post('/execution/oms/buying-power', async (req, reply) => {
    const ctx = deps.edgeContext({ headers: req.headers, id: String(req.id) });
    if (!ctx.principal || !hasAdminWrite(ctx.principal)) {
      return reply.code(401).send({ code: 'UNAUTHORIZED' });
    }
    const body = (req.body ?? {}) as OmsBuyingPowerDoorBody;
    return reply.send(handleOmsBuyingPowerDoor(body));
  });
}
