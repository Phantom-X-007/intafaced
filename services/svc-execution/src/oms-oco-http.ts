/**
 * Live HTTP door: OMS OCO/bracket that is not matching OCO refuses by field.
 * Matching `oco-link.ts` / `oco-cancel.ts` / `bracket.ts` already install
 * linked rest + guaranteed cancel of the other side — do not dual-implement.
 * router.ts is not recut. OMS submit cannot cancel the sibling. Paper stays paper.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { refuseLiveOmsOco, type OmsOcoRefusal } from './oms-oco-refuse.js';

export type OmsOcoDoorBody = {
  readonly oco?: boolean;
  readonly bracket?: boolean;
  readonly takeProfit?: string | null;
  readonly stopLoss?: string | null;
  readonly ocoSiblingId?: string | null;
  readonly kind?: string | null;
};

export type OmsOcoDoorDeps = {
  readonly edgeContext: (req: { headers: FastifyRequest['headers']; id: string }) => {
    principal?: { userId?: string; scopes?: readonly string[] } | null;
  };
};

function hasAdminWrite(principal: { scopes?: readonly string[] } | null | undefined): boolean {
  return Boolean(principal?.scopes?.includes('admin:write'));
}

const ALWAYS_REFUSE: OmsOcoRefusal = {
  ok: false,
  reason: 'oco_unsupported',
  field: 'oco',
  detail:
    'live OMS OCO is not matching OCO — refusing rather than placing one side without guaranteed cancel of the other',
};

/** Pure door — tests call this. Any oco/bracket on OMS refuses by field. */
export function handleOmsOcoDoor(body: OmsOcoDoorBody): OmsOcoRefusal {
  return refuseLiveOmsOco(body) ?? ALWAYS_REFUSE;
}

export function registerOmsOcoDoor(app: FastifyInstance, deps: OmsOcoDoorDeps): void {
  app.post('/execution/oms/oco', async (req, reply) => {
    const ctx = deps.edgeContext({ headers: req.headers, id: String(req.id) });
    if (!ctx.principal || !hasAdminWrite(ctx.principal)) {
      return reply.code(401).send({ code: 'UNAUTHORIZED' });
    }
    const body = (req.body ?? {}) as OmsOcoDoorBody;
    return reply.send(handleOmsOcoDoor(body));
  });
}
