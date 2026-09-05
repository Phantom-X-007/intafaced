/**
 * Live HTTP door: worst-case pre-trade risk refuses if buying-power path unset.
 * Live slice stays oms-slice.ts (twap|vwap|pov). This door never slices.
 * router.ts is not recut. Paper stays paper. No invented buying power.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { refuseUnsetBuyingPower, type OmsBuyingPowerRefusal } from './oms-buying-power.js';
import { authorizeOmsWriteHmac, readOmsWriteSecret } from './oms-write-hmac.js';

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
  readonly internalSecret?: string | null;
};

/** Pure door — tests call this. Missing/blank/invalid buying power refuses. Never slices. */
export function handleOmsBuyingPowerDoor(body: OmsBuyingPowerDoorBody): OmsBuyingPowerDoorResult {
  return refuseUnsetBuyingPower(body.buyingPower);
}

export function registerOmsBuyingPowerDoor(app: FastifyInstance, deps: OmsBuyingPowerDoorDeps): void {
  app.post('/execution/oms/buying-power', async (req, reply) => {
    const auth = authorizeOmsWriteHmac(req.headers, readOmsWriteSecret(deps.internalSecret));
    if (!auth.ok) return reply.code(auth.status).send(auth.body);
    const body = (req.body ?? {}) as OmsBuyingPowerDoorBody;
    return reply.send(handleOmsBuyingPowerDoor(body));
  });
}
