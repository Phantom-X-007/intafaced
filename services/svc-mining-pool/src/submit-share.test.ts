import { describe, expect, it } from 'vitest';
import { serviceAuthHeaders, serviceAuthHeadersForBody } from '@intafaced/contracts';
import { handleSubmitSharePost, parsePplnsBody } from './submit-share.js';

const SECRET = 'test-internal-service-secret-32ch!!';
const SHARE_BODY = JSON.stringify({
  windowId: 'w',
  epoch: 1,
  assetId: 'IFC',
  reward: '10',
  feeBps: 100,
  shares: [{ shareId: 'a', minerId: 'alice', weight: '1' }],
});

describe('mining submitShare parse', () => {
  it('refuses JS number amounts and weights at the HTTP boundary', () => {
    expect(() =>
      parsePplnsBody({
        windowId: 'w',
        epoch: 1,
        assetId: 'IFC',
        reward: 10,
        feeBps: 100,
        shares: [{ shareId: 'a', minerId: 'alice', weight: '1' }],
      }),
    ).toThrow('mining.amount_not_decimal');
    expect(() =>
      parsePplnsBody({
        windowId: 'w',
        epoch: 1,
        assetId: 'IFC',
        reward: '10',
        feeBps: 100,
        shares: [{ shareId: 'a', minerId: 'alice', weight: 1 }],
      }),
    ).toThrow('mining.weight_not_integer');
  });

  it('accepts decimal-string reward and integer-string weight', () => {
    expect(
      parsePplnsBody({
        windowId: 'w',
        epoch: 1,
        assetId: 'IFC',
        reward: '10',
        feeBps: 100,
        shares: [{ shareId: 'a', minerId: 'alice', weight: '1' }],
      }),
    ).toEqual({
      windowId: 'w',
      epoch: 1,
      assetId: 'IFC',
      reward: '10',
      feeBps: 100,
      shares: [{ shareId: 'a', minerId: 'alice', weight: 1n }],
    });
  });
});

describe('mining submitShare HMAC', () => {
  it('401 without service credentials — persist is not reached', async () => {
    const res = await handleSubmitSharePost({
      headers: {},
      rawBody: Buffer.from(SHARE_BODY, 'utf8'),
      secret: SECRET,
      sql: null,
    });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ accepted: false, code: 'mining.unauthenticated', rejected: 'missing' });
  });

  it('401 when INTERNAL_SERVICE_SECRET is blank', async () => {
    const payload = Buffer.from(SHARE_BODY, 'utf8');
    const res = await handleSubmitSharePost({
      headers: serviceAuthHeadersForBody('svc-cron', SECRET, payload),
      rawBody: payload,
      secret: '',
      sql: null,
    });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ accepted: false, code: 'mining.unauthenticated', rejected: 'unset' });
  });

  it('401 for v1 HMAC without body digest', async () => {
    const res = await handleSubmitSharePost({
      headers: serviceAuthHeaders('svc-cron', SECRET),
      rawBody: Buffer.from(SHARE_BODY, 'utf8'),
      secret: SECRET,
      sql: null,
    });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      accepted: false,
      code: 'mining.unauthenticated',
      rejected: 'missing-body-digest',
    });
  });

  it('v2 HMAC reaches the persist door (PG missing is 409, not 401)', async () => {
    const payload = Buffer.from(SHARE_BODY, 'utf8');
    const res = await handleSubmitSharePost({
      headers: serviceAuthHeadersForBody('svc-cron', SECRET, payload),
      rawBody: payload,
      secret: SECRET,
      sql: null,
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ accepted: false, error: 'mining.pg_unavailable' });
  });
});
