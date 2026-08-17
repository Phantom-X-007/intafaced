/**
 * Public §29 Quant honesty door (D26-P1-X6).
 *
 * Wires `@intafaced/quant-honesty` onto a shipped HTTP surface so incomplete
 * backtests cannot render. This module computes no return, ranks no strategy,
 * and does not scaffold svc-quant. Callers supply candidate evidence; the
 * package refuses by name or returns a renderable contract without a returns
 * field.
 */

import type { FastifyInstance } from 'fastify';
import {
  assessBacktestSurface,
  assessStrategyComparisonOrder,
  buildPerformanceContextLabels,
  type BacktestCostModel,
  type BacktestSurfaceAssessment,
  type BacktestSurfaceCandidate,
  type CostModelEvidence,
  type OutOfSampleVerdict,
  type StrategyComparisonOrderAssessment,
} from '@intafaced/quant-honesty';

export const QUANT_HONESTY_ASSESS_PATH = '/quant/honesty/assess-backtest';
export const QUANT_HONESTY_COMPARISON_PATH = '/quant/honesty/assess-comparison-order';
export const QUANT_HONESTY_LABELS_PATH = '/quant/honesty/performance-labels';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseOutOfSample(value: unknown): OutOfSampleVerdict | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const rec = asRecord(value);
  if (!rec) return null;
  return {
    status: (asString(rec.status) ?? '') as OutOfSampleVerdict['status'],
    evaluatedFrom: asString(rec.evaluatedFrom) ?? '',
    evaluatedTo: asString(rec.evaluatedTo) ?? '',
    sampleCount: typeof rec.sampleCount === 'number' ? rec.sampleCount : 0,
  };
}

function parseCostEvidence<TKind extends string>(value: unknown): CostModelEvidence<TKind> | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const rec = asRecord(value);
  if (!rec) return null;
  return {
    kind: (asString(rec.kind) ?? '') as TKind,
    source: asString(rec.source) ?? '',
  };
}

function parseCostModel(value: unknown): BacktestCostModel | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const rec = asRecord(value);
  if (!rec) return null;
  return {
    fees: parseCostEvidence(rec.fees),
    slippage: parseCostEvidence(rec.slippage),
    latency: parseCostEvidence(rec.latency),
  };
}

/** Map untyped HTTP JSON onto the contract candidate. Never copies a returns field. */
export function candidateFromBody(body: unknown): BacktestSurfaceCandidate {
  const rec = asRecord(body) ?? {};
  const variant = rec.strategyVariantCount;
  return {
    runId: asString(rec.runId) ?? '',
    strategyId: asString(rec.strategyId) ?? '',
    strategyVariantCount: typeof variant === 'number' ? variant : undefined,
    outOfSampleVerdict: parseOutOfSample(rec.outOfSampleVerdict),
    costModel: parseCostModel(rec.costModel),
  };
}

export function assessBacktestFromBody(body: unknown): BacktestSurfaceAssessment {
  return assessBacktestSurface(candidateFromBody(body));
}

export function assessComparisonFromBody(body: unknown): StrategyComparisonOrderAssessment {
  const rec = asRecord(body);
  return assessStrategyComparisonOrder(asString(rec?.order) ?? '');
}

export function quantHonestyHttpStatus(ok: boolean): 200 | 409 {
  return ok ? 200 : 409;
}

/**
 * Register the public honesty doors. Not proxied to a Quant service — none exists.
 * Incomplete evidence is 409 + named refusal so a client cannot treat it as renderable.
 */
export function registerQuantHonestyRoutes(app: FastifyInstance): void {
  app.post(QUANT_HONESTY_ASSESS_PATH, async (req, reply) => {
    const assessment = assessBacktestFromBody(req.body);
    if (!assessment.ok) {
      return reply.code(409).send({ ok: false, refusal: assessment.refusal });
    }
    return reply.code(200).send({
      ok: true,
      surface: assessment.surface,
      labels: buildPerformanceContextLabels(),
    });
  });

  app.post(QUANT_HONESTY_COMPARISON_PATH, async (req, reply) => {
    const assessment = assessComparisonFromBody(req.body);
    if (!assessment.ok) {
      return reply.code(409).send({ ok: false, refusal: assessment.refusal });
    }
    return reply.code(200).send({ ok: true, order: assessment.order });
  });

  app.get(QUANT_HONESTY_LABELS_PATH, async (_req, reply) => {
    return reply.code(200).send({
      ok: true,
      labels: buildPerformanceContextLabels(),
    });
  });
}
