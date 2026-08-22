import Fastify from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXECUTION_ARB_SCAN_CONSUMER_PATH, registerExecutionArbScanConsumerRoutes } from './execution-arb-scan-consumer-door.js';

describe('execution.arb scan consumer door', () => {
  const app = Fastify();

  beforeAll(async () => {
    registerExecutionArbScanConsumerRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
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
