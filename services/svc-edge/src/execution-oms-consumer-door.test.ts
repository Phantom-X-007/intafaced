import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { EXECUTION_OMS_CONSUMER_PATH, registerExecutionOmsConsumerRoutes } from './execution-oms-consumer-door.js';

describe('execution OMS consumer door', () => {
  it('documents proxied OMS procedures without inventing product wiring', async () => {
    const app = Fastify();
    registerExecutionOmsConsumerRoutes(app);
    const res = await app.inject({ method: 'GET', url: EXECUTION_OMS_CONSUMER_PATH });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ReturnType<typeof import('./execution-oms-consumer-door.js').describeExecutionOmsConsumerDoor>;
    expect(body.upstreamTrpcBase).toBe('/api/execution/trpc');
    expect(body.omsProcedures).toContain('execution.oms.execute');
    expect(body.inventsParentChild).toBe(false);
    await app.close();
  });
});
