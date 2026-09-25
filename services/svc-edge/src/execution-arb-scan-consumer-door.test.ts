import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthError } from '@intafaced/auth';
import { EXECUTION_ARB_SCAN_CONSUMER_PATH, registerExecutionArbScanConsumerRoutes } from './execution-arb-scan-consumer-door.js';

const allow = async () => ({ userId: 'operator' });

describe('execution.arb scan consumer door', () => {
  const app = Fastify();

  beforeAll(async () => {
    registerExecutionArbScanConsumerRoutes(app, allow);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('refuses a caller who is not an operator', async () => {
    const locked = Fastify();
    registerExecutionArbScanConsumerRoutes(locked, async () => {
      throw new AuthError('An operator token is required', 'token.invalid');
    });
    const res = await locked.inject({ method: 'GET', url: EXECUTION_ARB_SCAN_CONSUMER_PATH });
    expect(res.statusCode).toBe(401);
    await locked.close();
  });

  it('mounts named consumer door with execution upstream path', async () => {
    const res = await app.inject({ method: 'GET', url: EXECUTION_ARB_SCAN_CONSUMER_PATH });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      path: EXECUTION_ARB_SCAN_CONSUMER_PATH,
      upstreamTrpc: '/api/execution/trpc/execution.arb.scan',
      inventsQuotes: false,
    });
  });
});
