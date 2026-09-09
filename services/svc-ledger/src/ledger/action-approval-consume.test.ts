import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionApprovalConsumeError,
  ledgerActionPayloadHash,
  readApprovalIds,
  unwiredApprovalConsumer,
} from './action-approval-consume.js';

const HERE = dirname(fileURLToPath(import.meta.url));

describe('ledger action-approval consume', () => {
  it('payload hash is stable for the same freeze reason', () => {
    expect(ledgerActionPayloadHash('ledger.freeze', { reason: 'suspected drift in USDT' })).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(ledgerActionPayloadHash('ledger.freeze', { reason: 'a' })).not.toBe(ledgerActionPayloadHash('ledger.freeze', { reason: 'b' }));
  });

  it('blank IDENTITY_URL consumer refuses instead of inventing a second person', async () => {
    await expect(
      unwiredApprovalConsumer().consume({
        approvalId: 'appr-1',
        operationId: 'op-1',
        payloadHash: 'sha256:abc',
        targetService: 'svc-ledger',
        targetId: 'posting_freeze',
        expectedVersion: '1',
      }),
    ).rejects.toMatchObject({ code: 'action_approval.identity_unwired' });
  });

  it('typed-in names without approval ids refuse', () => {
    expect(() => readApprovalIds({ approvalId: null, operationId: null })).toThrow(ActionApprovalConsumeError);
  });

  it('boot freeze path is not wired through consume', () => {
    const service = readFileSync(join(HERE, '../service.ts'), 'utf8');
    expect(service).toMatch(/applyStartupPolicy/);
    expect(service).not.toMatch(/actionApproval/);
  });
});
