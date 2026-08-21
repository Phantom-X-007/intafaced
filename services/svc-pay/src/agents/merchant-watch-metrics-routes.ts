/**
 * S2S merchant approval-rate samples for svc-agents merchant watch.
 *
 * Class X: until operator-owned metrics storage is wired, every call refuses
 * `no_live_metrics` — never a fabricated 0.92 approval rate.
 */

import type { FastifyInstance } from 'fastify';
import { verifyServiceHeaders } from '@intafaced/contracts';

export const MERCHANT_WATCH_METRICS_PATH = '/internal/agents/merchant-watch-metrics' as const;
export const MERCHANT_WATCH_METRICS_PUBLISH_PATH = '/internal/agents/merchant-watch-metrics/publish' as const;

export type MerchantWatchMetricsRefuse = {
  readonly ok: false;
  readonly reason: 'no_live_metrics';
};

export type MerchantWatchMetricsPublishRefuse = {
  readonly ok: false;
  readonly reason: 'no_metrics_store';
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
};

export function registerMerchantWatchMetricsRoutes(app: FastifyInstance, deps: MerchantWatchMetricsRouteDeps): void {
  const authorised = (headers: Record<string, string | string[] | undefined>): boolean =>
    verifyServiceHeaders(headers, deps.internalSecret).service !== null;

  app.get(MERCHANT_WATCH_METRICS_PATH, async (req, reply) => {
    if (!authorised(req.headers)) {
      return reply.code(401).send({ error: 'pay.unauthenticated', message: 'service credentials required' });
    }
    const body: MerchantWatchMetricsRefuse = { ok: false, reason: 'no_live_metrics' };
    return reply.code(503).send(body);
  });

  app.post(MERCHANT_WATCH_METRICS_PUBLISH_PATH, async (req, reply) => {
    if (!authorised(req.headers)) {
      return reply.code(401).send({ error: 'pay.unauthenticated', message: 'service credentials required' });
    }
    const body: MerchantWatchMetricsPublishRefuse = { ok: false, reason: 'no_metrics_store' };
    return reply.code(503).send(body);
  });
}
