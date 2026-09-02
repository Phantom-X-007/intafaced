/**
 * Live HTTP door for startBasketParent.
 * Generic live slice (twap|vwap|pov) does not cover basket. router.ts is not recut.
 * Ledger qty strings. Partial-failure refuse_all only. Signed principal is the operator.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { startBasketParent, type OmsBasketStartResult } from './oms-basket-start.js';
import {
  resolveMatchingVenueHalt,
  type MatchingVenueHaltPort,
} from './oms-matching-venue-halt.js';
import type { AlgoJobsGate } from './oms-start.js';

export type StartBasketDoorBody = {
  readonly parentClientOrderId?: string;
  readonly kind?: string;
  readonly approved?: boolean;
  readonly status?: string;
  readonly legs?: readonly { name?: string | null; qty?: string | null }[];
  readonly partialFailurePolicy?: string | null;
  readonly credit?: string | null;
  readonly remaining?: string | null;
  readonly operatorId?: string;
};

export type StartBasketDoorDeps = {
  readonly jobs: AlgoJobsGate;
  readonly matchingVenueHalt: MatchingVenueHaltPort;
  readonly edgeContext: (req: { headers: FastifyRequest['headers']; id: string }) => {
    principal?: { userId?: string; scopes?: readonly string[] } | null;
  };
};

function hasAdminWrite(principal: { scopes?: readonly string[] } | null | undefined): boolean {
  return Boolean(principal?.scopes?.includes('admin:write'));
}

/** Pure door — tests call this. Signed principal is the operator; body operatorId is ignored. */
export async function handleStartBasketDoor(
  body: StartBasketDoorBody,
  operatorId: string | undefined,
  deps: Pick<StartBasketDoorDeps, 'jobs' | 'matchingVenueHalt'>,
): Promise<OmsBasketStartResult> {
  return startBasketParent({
    parentClientOrderId: body.parentClientOrderId,
    kind: body.kind,
    approved: body.approved,
    status: body.status,
    legs: body.legs,
    partialFailurePolicy: body.partialFailurePolicy,
    credit: body.credit,
    remaining: body.remaining,
    operatorId,
    jobs: deps.jobs,
    matchingVenueHalt: await resolveMatchingVenueHalt(deps.matchingVenueHalt),
  });
}

export function registerStartBasketDoor(app: FastifyInstance, deps: StartBasketDoorDeps): void {
  app.post('/execution/oms/start-basket', async (req, reply) => {
    const ctx = deps.edgeContext({ headers: req.headers, id: String(req.id) });
    if (!ctx.principal || !hasAdminWrite(ctx.principal)) {
      return reply.code(401).send({ code: 'UNAUTHORIZED' });
    }
    const body = (req.body ?? {}) as StartBasketDoorBody;
    return handleStartBasketDoor(body, ctx.principal.userId, deps);
  });
}
