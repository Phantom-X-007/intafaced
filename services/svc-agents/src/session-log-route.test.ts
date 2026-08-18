import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { createAgentsRouter } from './router.js';
import type { AgentsRouterDeps } from './router.js';
import type { AuditedAction } from './fleet/audit.js';
import type { SessionRecord } from './runtime.js';

const SECRET = 'an-agents-session-log-kind-filter-test-edge-secret';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SESSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const FOREIGN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
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

function owned(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return { id: SESSION, userId: USER, ...overrides } as SessionRecord;
}

function stubDeps(
  session: (sessionId: string) => Promise<SessionRecord | null>,
  sessionLog: (sessionId: string, kind?: AuditedAction['kind'], tool?: string) => Promise<AuditedAction[]>,
): AgentsRouterDeps {
  return {
    runtime: { session, sessionLog } as AgentsRouterDeps['runtime'],
    gateway: { routingTable: { routes: [] } } as unknown as AgentsRouterDeps['gateway'],
    meter: {} as AgentsRouterDeps['meter'],
    feeAssetId: 'IFC',
  };
}

function action(overrides: Partial<AuditedAction> = {}): AuditedAction {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    sessionId: SESSION,
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

describe('session.log kind filter', () => {
  it('omits kind and still returns mixed kinds in sequence for an owned session', async () => {
    const calls: Array<{ sessionId: string; kind?: AuditedAction['kind']; tool?: string }> = [];
    const mixed = [
      action({ tool: null, kind: 'session_open', sequence: 0 }),
      action({ tool: 'trade.quote', kind: 'tool_call', sequence: 1, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }),
    ];
    const caller = createAgentsRouter(
      stubDeps(
        async (sessionId) => owned({ id: sessionId }),
        async (sessionId, kind, tool) => {
          calls.push({ sessionId, kind, tool });
          return mixed;
        },
      ),
    ).createCaller(signed());

    const result = await caller.session.log({ sessionId: SESSION });
    expect(calls).toEqual([{ sessionId: SESSION, kind: undefined, tool: undefined }]);
    expect(result.map((row) => row.kind)).toEqual(['session_open', 'tool_call']);
    expect(result.map((row) => row.sequence)).toEqual([0, 1]);
  });

  it('passes an exact kind after ownedSession', async () => {
    const calls: Array<{ sessionId: string; kind?: AuditedAction['kind']; tool?: string }> = [];
    const caller = createAgentsRouter(
      stubDeps(
        async (sessionId) => owned({ id: sessionId }),
        async (sessionId, kind, tool) => {
          calls.push({ sessionId, kind, tool });
          return [action({ kind: 'tool_call' })];
        },
      ),
    ).createCaller(signed());

    const result = await caller.session.log({ sessionId: SESSION, kind: 'tool_call' });
    expect(calls).toEqual([{ sessionId: SESSION, kind: 'tool_call', tool: undefined }]);
    expect(result.every((row) => row.kind === 'tool_call')).toBe(true);
  });

  it('returns [] when the store has no matching kind', async () => {
    const caller = createAgentsRouter(
      stubDeps(
        async (sessionId) => owned({ id: sessionId }),
        async () => [],
      ),
    ).createCaller(signed());
    expect(await caller.session.log({ sessionId: SESSION, kind: 'embedding' })).toEqual([]);
  });

  it('rejects an invalid kind with 400 before the store', async () => {
    let called = false;
    const caller = createAgentsRouter(
      stubDeps(
        async () => owned(),
        async () => {
          called = true;
          return [];
        },
      ),
    ).createCaller(signed());

    await expect(caller.session.log({ sessionId: SESSION, kind: 'not_a_kind' as 'tool_call' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(called).toBe(false);
  });

  it('refuses a foreign session without reading its log', async () => {
    let logCalled = false;
    const caller = createAgentsRouter(
      stubDeps(
        async (sessionId) => owned({ id: sessionId, userId: OTHER }),
        async () => {
          logCalled = true;
          return [action({ userId: OTHER, sessionId: FOREIGN })];
        },
      ),
    ).createCaller(signed());

    await expect(caller.session.log({ sessionId: FOREIGN, kind: 'tool_call' })).rejects.toBeDefined();
    expect(logCalled).toBe(false);
  });
});

describe('session.log tool filter', () => {
  it('omits tool and still returns mixed tools in sequence for an owned session', async () => {
    const calls: Array<{ sessionId: string; kind?: AuditedAction['kind']; tool?: string }> = [];
    const mixed = [
      action({ tool: null, kind: 'session_open', sequence: 0 }),
      action({ tool: 'trade.quote', kind: 'tool_call', sequence: 1, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }),
    ];
    const caller = createAgentsRouter(
      stubDeps(
        async (sessionId) => owned({ id: sessionId }),
        async (sessionId, kind, tool) => {
          calls.push({ sessionId, kind, tool });
          return mixed;
        },
      ),
    ).createCaller(signed());

    const result = await caller.session.log({ sessionId: SESSION });
    expect(calls).toEqual([{ sessionId: SESSION, kind: undefined, tool: undefined }]);
    expect(result.map((row) => row.tool)).toEqual([null, 'trade.quote']);
  });

  it('passes an exact tool after ownedSession', async () => {
    const calls: Array<{ sessionId: string; kind?: AuditedAction['kind']; tool?: string }> = [];
    const caller = createAgentsRouter(
      stubDeps(
        async (sessionId) => owned({ id: sessionId }),
        async (sessionId, kind, tool) => {
          calls.push({ sessionId, kind, tool });
          return [action({ tool: 'trade.quote' })];
        },
      ),
    ).createCaller(signed());

    const result = await caller.session.log({ sessionId: SESSION, tool: 'trade.quote' });
    expect(calls).toEqual([{ sessionId: SESSION, kind: undefined, tool: 'trade.quote' }]);
    expect(result.every((row) => row.tool === 'trade.quote')).toBe(true);
  });

  it('ANDs kind with tool after ownedSession', async () => {
    const calls: Array<{ sessionId: string; kind?: AuditedAction['kind']; tool?: string }> = [];
    const caller = createAgentsRouter(
      stubDeps(
        async (sessionId) => owned({ id: sessionId }),
        async (sessionId, kind, tool) => {
          calls.push({ sessionId, kind, tool });
          return [action({ tool: 'trade.quote', kind: 'tool_call' })];
        },
      ),
    ).createCaller(signed());

    const result = await caller.session.log({ sessionId: SESSION, kind: 'tool_call', tool: 'trade.quote' });
    expect(calls).toEqual([{ sessionId: SESSION, kind: 'tool_call', tool: 'trade.quote' }]);
    expect(result.every((row) => row.kind === 'tool_call' && row.tool === 'trade.quote')).toBe(true);
  });

  it('returns [] when the store has no matching tool', async () => {
    const caller = createAgentsRouter(
      stubDeps(
        async (sessionId) => owned({ id: sessionId }),
        async () => [],
      ),
    ).createCaller(signed());
    expect(await caller.session.log({ sessionId: SESSION, tool: 'trade.quote' })).toEqual([]);
  });

  it('rejects an empty tool with 400 before the store', async () => {
    let called = false;
    const caller = createAgentsRouter(
      stubDeps(
        async () => owned(),
        async () => {
          called = true;
          return [];
        },
      ),
    ).createCaller(signed());

    await expect(caller.session.log({ sessionId: SESSION, tool: '' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(called).toBe(false);
  });

  it('refuses a foreign session without reading its log when a tool is set', async () => {
    let logCalled = false;
    const caller = createAgentsRouter(
      stubDeps(
        async (sessionId) => owned({ id: sessionId, userId: OTHER }),
        async () => {
          logCalled = true;
          return [action({ userId: OTHER, sessionId: FOREIGN })];
        },
      ),
    ).createCaller(signed());

    await expect(caller.session.log({ sessionId: FOREIGN, tool: 'trade.quote' })).rejects.toBeDefined();
    expect(logCalled).toBe(false);
  });
});
