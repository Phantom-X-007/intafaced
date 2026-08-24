import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  CONNECT_DATA_LAKE_PERSIST_CONSUMER_PATH,
  registerConnectDataLakePersistConsumerRoutes,
} from './connect-data-lake-persist-consumer-door.js';

describe('connect.data-lake persist consumer door', () => {
  it('reports captureLogOnly when retention env is incomplete', async () => {
    const app = Fastify();
    registerConnectDataLakePersistConsumerRoutes(app);
    const res = await app.inject({ method: 'GET', url: CONNECT_DATA_LAKE_PERSIST_CONSUMER_PATH });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { captureLogOnly: boolean; inventsRetentionDays: boolean };
    expect(body.captureLogOnly).toBe(true);
    expect(body.inventsRetentionDays).toBe(false);
    await app.close();
  });
});
