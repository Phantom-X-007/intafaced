/**
 * Live HTTP + tRPC door for killLiveAlgoParent.
 * Matching never-saw (404) / ack without sequence is killed false.
 * tRPC killParent calls handleKillParentDoor. Matching mill is not recut.
 * Paper never ledgers. Cancel is a request until matching sequence.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { VenueKind } from '@intafaced/venue-adapter';
import { killLiveAlgoParent, type OmsKillParentResult } from './oms-kill-parent.js';
import type { OmsCancelFn } from './oms-cancel.js';
import type { EmsOrderStore } from './oms-ems-store.js';
import type { AlgoPauseStore } from './oms-pause.js';
import { refuseLiveOmsPaper, type OmsPaperUnsupportedRefuse } from './oms-paper-refuse.js';
import type { ApprovedAlgoParentStore } from './oms-start.js';
import type { OmsKillParentMatchingChild } from './oms-kill-parent-matching.js';

export type KillParentDoorBody = {
  readonly parentClientOrderId?: string;
  readonly executionGroupId?: string;
  readonly paper?: boolean;
  readonly kind?: string;
  readonly children?: readonly OmsKillParentMatchingChild[];
};

export type KillParentDoorDeps = {
  readonly parentStore?: ApprovedAlgoParentStore;
  readonly pauseStore?: AlgoPauseStore;
  readonly emsStore?: EmsOrderStore;
  readonly cancelByVenue?: Readonly<Record<string, OmsCancelFn>>;
  readonly kindsByVenue?: Readonly<Record<string, VenueKind>>;
  readonly matchingUrl?: string | null;
  readonly fetch?: typeof fetch;
  readonly edgeContext: (req: { headers: FastifyRequest['headers']; id: string }) => {
    principal?: { userId?: string; scopes?: readonly string[] } | null;
  };
};

export type KillParentDoorResult = OmsKillParentResult | OmsPaperUnsupportedRefuse;

function hasAdminWrite(principal: { scopes?: readonly string[] } | null | undefined): boolean {
  return Boolean(principal?.scopes?.includes('admin:write'));
}

/** Pure door — tests call this. Signed principal is the operator; body operatorId is ignored. */
export async function handleKillParentDoor(
  body: KillParentDoorBody,
  operatorId: string | undefined,
  deps: Omit<KillParentDoorDeps, 'edgeContext'>,
): Promise<KillParentDoorResult> {
  const paper = refuseLiveOmsPaper({ kind: body.kind, paper: body.paper === true });
  if (paper) return paper;
  return killLiveAlgoParent({
    parentClientOrderId: body.parentClientOrderId,
    executionGroupId: body.executionGroupId,
    operatorId,
    parentStore: deps.parentStore,
    pauseStore: deps.pauseStore,
    emsStore: deps.emsStore,
    cancelByVenue: deps.cancelByVenue,
    kindsByVenue: deps.kindsByVenue,
    matchingUrl: deps.matchingUrl,
    matchingChildren: body.children,
    fetch: deps.fetch,
  });
}

export function registerKillParentDoor(app: FastifyInstance, deps: KillParentDoorDeps): void {
  app.post('/execution/oms/kill-parent', async (req, reply) => {
    const ctx = deps.edgeContext({ headers: req.headers, id: String(req.id) });
    if (!ctx.principal || !hasAdminWrite(ctx.principal)) {
      return reply.code(401).send({ code: 'UNAUTHORIZED' });
    }
    const body = (req.body ?? {}) as KillParentDoorBody;
    return reply.send(await handleKillParentDoor(body, ctx.principal.userId, deps));
  });
}
