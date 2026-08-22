/**
 * connect.data-lake quant surface render door on svc-edge (D34).
 *
 * Wires evaluateQuantSurfaceRender onto a shipped HTTP surface. Incomplete
 * framing returns 409 + named refuse — never partial render.
 */

import type { FastifyInstance } from 'fastify';
import { evaluateQuantSurfaceRender, type QuantSurfaceRenderInput } from '@intafaced/connect-data-lake';

export const QUANT_SURFACE_RENDER_PATH = '/quant/honesty/assess-surface-render';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asBool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function asNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asOos(value: unknown): QuantSurfaceRenderInput['backtest']['outOfSampleVerdict'] {
  if (value === undefined) return null;
  if (value === 'pass' || value === 'fail' || value === 'inconclusive') return value;
  return null;
}

function asSurface(value: unknown): QuantSurfaceRenderInput['leaderboard']['surface'] {
  if (value === 'backtest' || value === 'copy' || value === 'marketplace') return value;
  return 'backtest';
}

function asWeight(value: unknown): 'normal' | 'muted' | null {
  if (value === 'normal' || value === 'muted') return value;
  return null;
}

/** Map untyped HTTP JSON onto the composite render input. Never invents framing fields. */
export function quantSurfaceRenderInputFromBody(body: unknown): QuantSurfaceRenderInput {
  const rec = asRecord(body) ?? {};
  const backtest = asRecord(rec.backtest) ?? {};
  const costs = asRecord(backtest.costs) ?? {};
  const leaderboard = asRecord(rec.leaderboard) ?? {};
  const compare = asRecord(rec.compare) ?? {};

  return {
    backtest: {
      outOfSampleVerdict: asOos(backtest.outOfSampleVerdict),
      costs: {
        feesModelled: asBool(costs.feesModelled) ?? false,
        slippageModelled: asBool(costs.slippageModelled) ?? false,
        latencyModelled: asBool(costs.latencyModelled) ?? false,
      },
      variantCount: asNumber(backtest.variantCount) ?? null,
    },
    leaderboard: {
      rankedByHistoricalReturn: asBool(leaderboard.rankedByHistoricalReturn) ?? false,
      surface: asSurface(leaderboard.surface),
    },
    compare: {
      showsLivePnl: asBool(compare.showsLivePnl) ?? false,
      showsBacktestPnl: asBool(compare.showsBacktestPnl) ?? false,
      liveLabelWeight: asWeight(compare.liveLabelWeight),
      backtestLabelWeight: asWeight(compare.backtestLabelWeight),
    },
  };
}

export function registerQuantSurfaceRenderRoutes(app: FastifyInstance): void {
  app.post(QUANT_SURFACE_RENDER_PATH, async (req, reply) => {
    const decision = evaluateQuantSurfaceRender(quantSurfaceRenderInputFromBody(req.body));
    if (!decision.ok) {
      return reply.code(409).send({
        ok: false,
        reason: decision.reason,
        message: decision.message,
      });
    }
    return reply.code(200).send({ ok: true });
  });
}
