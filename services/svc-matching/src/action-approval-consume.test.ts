import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ActionApprovalConsumeError,
  createIdentityApprovalClient,
  matchingActionPayloadHash,
  readApprovalIds,
  unwiredApprovalConsumer,
  unwrapTrpcJson,
} from './action-approval-consume.js';

describe('matching action-approval consume', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('payload hash is stable for the same halt market', () => {
    expect(matchingActionPayloadHash('matching.halt', { marketId: 'BTC-USDT' })).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(matchingActionPayloadHash('matching.halt', { marketId: 'BTC-USDT' })).not.toBe(
      matchingActionPayloadHash('matching.halt', { marketId: 'ETH-USDT' }),
    );
    expect(matchingActionPayloadHash('matching.halt_all', {})).not.toBe(matchingActionPayloadHash('matching.resume_all', {}));
  });

  it('blank IDENTITY_URL consumer refuses instead of inventing a second person', async () => {
    await expect(
      unwiredApprovalConsumer().consume({
        approvalId: 'appr-1',
        operationId: 'op-1',
        payloadHash: 'sha256:abc',
        targetService: 'svc-matching',
        targetId: 'halt:BTC-USDT',
        expectedVersion: '1',
      }),
    ).rejects.toMatchObject({ code: 'action_approval.identity_unwired' });
  });

  it('typed-in names without approval ids refuse', () => {
    expect(() => readApprovalIds({ approvalId: null, operationId: null })).toThrow(ActionApprovalConsumeError);
    expect(() => readApprovalIds({ approvalId: 'appr-1', operationId: '' })).toThrow(/typed-in second name/);
  });

  it('unwraps tRPC result.data.json', () => {
    const inner = { approvalId: 'appr-1', status: 'CONSUMED' };
    expect(unwrapTrpcJson({ result: { data: { json: inner } } })).toEqual(inner);
    expect(unwrapTrpcJson(inner)).toEqual(inner);
  });

  it('HMAC consume posts to identity actionApproval.consume as svc-matching', async () => {
    const row = {
      approvalId: 'appr-1',
      actionType: 'halt:BTC-USDT',
      targetService: 'svc-matching',
      targetId: 'halt:BTC-USDT',
      expectedVersion: '1',
      payloadHash: matchingActionPayloadHash('matching.halt', { marketId: 'BTC-USDT' }),
      requesterId: 'requester',
      approverId: 'ops-confirm',
      policyVersion: 'v1',
      createdAt: '2026-09-09T12:00:00.000Z',
      expiresAt: '2026-09-09T12:10:00.000Z',
      status: 'CONSUMED' as const,
      operationId: 'op-1',
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: { data: { json: row } } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    const client = createIdentityApprovalClient('http://identity.test', 's'.repeat(32));
    const consumed = await client.consume({
      approvalId: 'appr-1',
      operationId: 'op-1',
      payloadHash: row.payloadHash,
      targetService: 'svc-matching',
      targetId: 'halt:BTC-USDT',
      expectedVersion: '1',
    });
    expect(consumed.approverId).toBe('ops-confirm');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; body: string }];
    expect(url).toBe('http://identity.test/trpc/actionApproval.consume');
    expect(init.headers['x-intafaced-service']).toBe('svc-matching');
  });
});
