/**
 * S2S merchant approval-rate samples for svc-agents merchant watch.
 *
 * Empty store = honest `no_live_metrics`. Operator publishes real samples via
 * POST publish — never seeded with fabricated approval rates.
 */

import type { FastifyInstance } from 'fastify';
import { verifyServiceHeaders } from '@intafaced/contracts';
import type { MerchantWatchMetricsStore } from './merchant-watch-metrics-store.js';

export const MERCHANT_WATCH_METRICS_PATH = '/internal/agents/merchant-watch-metrics' as const;
export const MERCHANT_WATCH_METRICS_PUBLISH_PATH = '/internal/agents/merchant-watch-metrics/publish' as const;

export type MerchantWatchMetricsRefuse = {
  readonly ok: false;
  readonly reason: 'no_live_metrics';
};

export type MerchantWatchMetricsPublishRefuse = {
  readonly ok: false;
  readonly reason: 'no_metrics_store' | 'invalid_publish_body';
};

export type MerchantWatchMetricsPublishOk = {
  readonly ok: true;
};

export type MerchantWatchMetricsOk = {
  readonly ok: true;
  readonly points: readonly {
    readonly railId: string;
    readonly approvalRate: string | null;
    readonly attempts: number | null;
    readonly asOf: string;
    readonly maxAgeMs: number;
  }[];
};

export type MerchantWatchMetricsBody = MerchantWatchMetricsRefuse | MerchantWatchMetricsOk;

export type MerchantWatchMetricsRouteDeps = {
  readonly internalSecret: string;
  readonly store?: MerchantWatchMetricsStore;
};

function parsePublishBody(raw: unknown): MerchantWatchMetricsOk['points'][number] | null {
  if (raw === null || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  if (typeof body.railId !== 'string' || !body.railId.trim()) return null;
  if (body.approvalRate !== null && typeof body.approvalRate !== 'string') return null;
  if (body.attempts !== null && typeof body.attempts !== 'number') return null;
  if (typeof body.asOf !== 'string' || !body.asOf.trim()) return null;
  if (typeof body.maxAgeMs !== 'number' || !Number.isFinite(body.maxAgeMs) || body.maxAgeMs < 0) return null;
  return {
    railId: body.railId.trim(),
    approvalRate: body.approvalRate,
    attempts: body.attempts,
    asOf: body.asOf,
    maxAgeMs: body.maxAgeMs,
  };
}

export function registerMerchantWatchMetricsRoutes(app: FastifyInstance, deps: MerchantWatchMetricsRouteDeps): void {
  const authorised = (headers: Record<string, string | string[] | undefined>): boolean =>
    verifyServiceHeaders(headers, deps.internalSecret).service !== null;

  app.get(MERCHANT_WATCH_METRICS_PATH, async (req, reply) => {
    if (!authorised(req.headers)) {
      return reply.code(401).send({ error: 'pay.unauthenticated', message: 'service credentials required' });
    }
    if (!deps.store) {
      const body: MerchantWatchMetricsRefuse = { ok: false, reason: 'no_live_metrics' };
      return reply.code(503).send(body);
    }
    const points = await deps.store.listPoints();
    if (points.length === 0) {
      const body: MerchantWatchMetricsRefuse = { ok: false, reason: 'no_live_metrics' };
      return reply.code(503).send(body);
    }
    const body: MerchantWatchMetricsOk = { ok: true, points };
    return reply.send(body);
  });

  app.post(MERCHANT_WATCH_METRICS_PUBLISH_PATH, async (req, reply) => {
    if (!authorised(req.headers)) {
      return reply.code(401).send({ error: 'pay.unauthenticated', message: 'service credentials required' });
    }
    if (!deps.store) {
      const body: MerchantWatchMetricsPublishRefuse = { ok: false, reason: 'no_metrics_store' };
      return reply.code(503).send(body);
    }
    const point = parsePublishBody(req.body);
    if (!point) {
      const body: MerchantWatchMetricsPublishRefuse = { ok: false, reason: 'invalid_publish_body' };
      return reply.code(400).send(body);
    }
    await deps.store.publishPoint(point);
    const body: MerchantWatchMetricsPublishOk = { ok: true };
    return reply.send(body);
  });
}
