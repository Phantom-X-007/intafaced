/**
 * Composite quant honesty door (D35) — chains backtest surface assessment with
 * connect.data-lake surface render evaluation on one HTTP surface.
 *
 * Incomplete backtest evidence or dishonest render framing returns 409 by name.
 * Neither stage computes returns or ranks strategies.
 */

import type { FastifyInstance } from 'fastify';
import { buildPerformanceContextLabels } from '@intafaced/quant-honesty';
import { assessBacktestFromBody } from './quant-honesty-door.js';
import { quantSurfaceRenderInputFromBody } from './quant-surface-render-door.js';
import { evaluateQuantSurfaceRender } from '@intafaced/connect-data-lake';

export const QUANT_COMPOSITE_HONESTY_PATH = '/quant/honesty/assess-composite';

export function registerQuantCompositeHonestyRoutes(app: FastifyInstance): void {
  app.post(QUANT_COMPOSITE_HONESTY_PATH, async (req, reply) => {
    const backtest = assessBacktestFromBody(req.body);
    if (!backtest.ok) {
      return reply.code(409).send({ ok: false, stage: 'backtest', refusal: backtest.refusal });
    }

    const render = evaluateQuantSurfaceRender(quantSurfaceRenderInputFromBody(req.body));
    if (!render.ok) {
      return reply.code(409).send({
        ok: false,
        stage: 'surface_render',
        reason: render.reason,
        message: render.message,
      });
    }

    return reply.code(200).send({
      ok: true,
      surface: backtest.surface,
      labels: buildPerformanceContextLabels(),
    });
  });
}
