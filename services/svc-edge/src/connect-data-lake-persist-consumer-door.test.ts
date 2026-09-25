import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { AuthError } from '@intafaced/auth';
import {
  CONNECT_DATA_LAKE_PERSIST_CONSUMER_PATH,
  registerConnectDataLakePersistConsumerRoutes,
} from './connect-data-lake-persist-consumer-door.js';

const allow = async () => ({ userId: 'operator' });

describe('connect.data-lake persist consumer door', () => {
  it('refuses a caller who is not an operator', async () => {
    const app = Fastify();
    registerConnectDataLakePersistConsumerRoutes(app, async () => {
      throw new AuthError('An operator token is required', 'token.invalid');
    });
    const res = await app.inject({ method: 'GET', url: CONNECT_DATA_LAKE_PERSIST_CONSUMER_PATH });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'token.invalid' });
    await app.close();
  });

  it('reports captureLogOnly when retention env is incomplete', async () => {
    const app = Fastify();
    registerConnectDataLakePersistConsumerRoutes(app, allow);
    const res = await app.inject({ method: 'GET', url: CONNECT_DATA_LAKE_PERSIST_CONSUMER_PATH });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { captureLogOnly: boolean; inventsRetentionDays: boolean };
    expect(body.captureLogOnly).toBe(true);
    expect(body.inventsRetentionDays).toBe(false);
    await app.close();
  });
});
