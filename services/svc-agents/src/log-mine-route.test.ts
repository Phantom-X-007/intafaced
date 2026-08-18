import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from './router.js';
import type { AgentsRouterDeps } from './router.js';
import type { AuditedAction } from './fleet/audit.js';

const SECRET = 'an-agents-log-mine-tool-filter-test-edge-secret';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-agents' });

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['agents:read'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as Principal;
}

function signed(p: Principal = principal()) {
  const raw = encodePrincipal(p);
  return edgeContext({
    headers: {
      'x-intafaced-principal': raw,
      'x-intafaced-principal-sig': signPrincipalHeader(raw, SECRET, 'DE'),
      'x-intafaced-region': 'DE',
    },
    id: 'req-signed',
  });
}

function stubDeps(userLog: (userId: string, limit?: number, tool?: string) => Promise<AuditedAction[]>): AgentsRouterDeps {
  return {
    runtime: { userLog } as AgentsRouterDeps['runtime'],
    gateway: { routingTable: { routes: [] } } as unknown as AgentsRouterDeps['gateway'],
    meter: {} as AgentsRouterDeps['meter'],
    feeAssetId: 'IFC',
  };
}

function action(overrides: Partial<AuditedAction> = {}): AuditedAction {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    userId: USER,
    agentId: 'probe',
    sequence: 0,
    kind: 'tool_call',
    status: 'executed',
    tool: 'trade.quote',
    task: null,
    providerId: null,
    model: null,
    inputTokens: 0n,
    outputTokens: 0n,
    cost: 0n,
    refusalCode: null,
    userMessageKey: 'agents.tool.executed',
    userMessageParams: {},
    inputDigest: null,
    outputDigest: null,
    prevHash: null,
    hash: '0'.repeat(64),
    occurredAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('log.mine tool filter', () => {
  it('omits tool and still returns mixed tools for the caller', async () => {
    const calls: Array<{ userId: string; limit?: number; tool?: string }> = [];
    const mixed = [action({ tool: null, kind: 'session_open' }), action({ tool: 'trade.quote', sequence: 1 })];
    const caller = createAgentsRouter(
      stubDeps(async (userId, limit, tool) => {
        calls.push({ userId, limit, tool });
        return mixed;
      }),
    ).createCaller(signed());

    const result = await caller.log.mine({});
    expect(calls).toEqual([{ userId: USER, limit: 100, tool: undefined }]);
    expect(new Set(result.map((row) => row.tool))).toEqual(new Set([null, 'trade.quote']));
  });

  it('passes an exact tool and scopes the query to the caller', async () => {
    const calls: Array<{ userId: string; limit?: number; tool?: string }> = [];
    const caller = createAgentsRouter(
      stubDeps(async (userId, limit, tool) => {
        calls.push({ userId, limit, tool });
        return [action({ userId, tool: 'trade.quote' })];
      }),
    ).createCaller(signed());

    const result = await caller.log.mine({ tool: 'trade.quote', limit: 50 });
    expect(calls).toEqual([{ userId: USER, limit: 50, tool: 'trade.quote' }]);
    expect(result.every((row) => row.tool === 'trade.quote')).toBe(true);
    expect(calls.every((call) => call.userId !== OTHER)).toBe(true);
  });

  it('returns [] when the store has no matching rows', async () => {
    const caller = createAgentsRouter(stubDeps(async () => [])).createCaller(signed());
    expect(await caller.log.mine({ tool: 'trade.order' })).toEqual([]);
  });

  it('rejects empty-after-trim tool with 400 before the store', async () => {
    let called = false;
    const caller = createAgentsRouter(
      stubDeps(async () => {
        called = true;
        return [];
      }),
    ).createCaller(signed());

    await expect(caller.log.mine({ tool: '   ' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(called).toBe(false);
  });

  it('rejects a tool id longer than 64 with 400 before the store', async () => {
    let called = false;
    const caller = createAgentsRouter(
      stubDeps(async () => {
        called = true;
        return [];
      }),
    ).createCaller(signed());

    await expect(caller.log.mine({ tool: 't'.repeat(65) })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(called).toBe(false);
  });
});
