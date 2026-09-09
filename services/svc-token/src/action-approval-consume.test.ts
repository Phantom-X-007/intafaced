import { describe, expect, it, vi } from 'vitest';
import { actionApprovalSchema } from '@intafaced/contracts';
import {
  ActionApprovalConsumeError,
  createIdentityApprovalClient,
  readApprovalIds,
  tokenActionPayloadHash,
  unwiredApprovalConsumer,
} from './action-approval-consume.js';

const consumed = {
  approvalId: 'appr-1',
  actionType: 'token.revenue.distribute',
  targetService: 'svc-token',
  targetId: 'token.revenue.distribute',
  expectedVersion: 'w1',
  payloadHash: 'sha256:abc',
  requesterId: 'requester',
  approverId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  policyVersion: 'v1',
  createdAt: '2026-09-09T12:00:00.000Z',
  expiresAt: '2026-09-09T12:10:00.000Z',
  status: 'CONSUMED' as const,
  operationId: 'op-1',
};

describe('token action-approval consume', () => {
  it('payload hash is stable for the same window + amounts', () => {
    expect(tokenActionPayloadHash('token.revenue.distribute', { windowId: 'w1', sources: 'trade:100' })).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(tokenActionPayloadHash('token.revenue.distribute', { windowId: 'w1', sources: 'trade:100' })).not.toBe(
      tokenActionPayloadHash('token.revenue.distribute', { windowId: 'w1', sources: 'trade:101' }),
    );
  });

  it('blank IDENTITY_URL consumer refuses instead of inventing a second person', async () => {
    await expect(
      unwiredApprovalConsumer().consume({
        approvalId: 'appr-1',
        operationId: 'op-1',
        payloadHash: 'sha256:abc',
        targetService: 'svc-token',
        targetId: 'token.revenue.distribute',
        expectedVersion: 'w1',
      }),
    ).rejects.toMatchObject({ code: 'action_approval.identity_unwired' });
  });

  it('typed-in names without approval ids refuse', () => {
    expect(() => readApprovalIds({ approvalId: null, operationId: null })).toThrow(ActionApprovalConsumeError);
    expect(() => readApprovalIds({ approvalId: 'appr-1', operationId: '  ' })).toThrow(ActionApprovalConsumeError);
  });

  it('parses tRPC result.data (and superjson .json), not the raw envelope', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ result: { data: { json: consumed } } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const client = createIdentityApprovalClient('http://identity.test', 's'.repeat(32));
      const got = await client.consume({
        approvalId: 'appr-1',
        operationId: 'op-1',
        payloadHash: 'sha256:abc',
        targetService: 'svc-token',
        targetId: 'token.revenue.distribute',
        expectedVersion: 'w1',
      });
      expect(actionApprovalSchema.parse(got).approverId).toBe(consumed.approverId);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
