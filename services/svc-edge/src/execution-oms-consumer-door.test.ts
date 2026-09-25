import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { AuthError } from '@intafaced/auth';
import { EXECUTION_OMS_CONSUMER_PATH, registerExecutionOmsConsumerRoutes } from './execution-oms-consumer-door.js';

const allow = async () => ({ userId: 'operator' });

describe('execution OMS consumer door', () => {
  it('refuses a caller who is not an operator', async () => {
    const app = Fastify();
    registerExecutionOmsConsumerRoutes(app, async () => {
      throw new AuthError('An operator token is required', 'token.invalid');
    });
    const res = await app.inject({ method: 'GET', url: EXECUTION_OMS_CONSUMER_PATH });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('documents proxied OMS procedures without inventing product wiring', async () => {
    const app = Fastify();
    registerExecutionOmsConsumerRoutes(app, allow);
    const res = await app.inject({ method: 'GET', url: EXECUTION_OMS_CONSUMER_PATH });
    expect(res.statusCode).toBe(200);
    const body = res.json() as ReturnType<typeof import('./execution-oms-consumer-door.js').describeExecutionOmsConsumerDoor>;
    expect(body.upstreamTrpcBase).toBe('/api/execution/trpc');
    expect(body.omsProcedures).toContain('execution.oms.execute');
    expect(body.inventsParentChild).toBe(false);
    await app.close();
  });
});
