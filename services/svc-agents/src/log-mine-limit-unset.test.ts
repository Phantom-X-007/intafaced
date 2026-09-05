/**
 * log.mine omit must refuse — never invent a 100-row page.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { createEdgeContext, encodePrincipal, signPrincipalHeader } from '@intafaced/contracts';
import { AgentError, assertUserLogPageLimit } from './errors.js';
import { createAgentsRouter } from './router.js';
import type { AgentsRouterDeps } from './router.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SECRET = 'an-agents-log-mine-limit-unset-test-secret';
const USER = '11111111-1111-4111-8111-111111111111';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-agents' });

function signed() {
  const p = {
    sub: USER,
    userId: USER,
    sid: '22222222-2222-4222-8222-222222222222',
    scopes: ['agents:read'],
    tier: 'none',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
  } as Principal;
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

function stubDeps(userLog: (userId: string, limit: number) => Promise<never[]> = async () => []) {
  return {
    runtime: { userLog } as AgentsRouterDeps['runtime'],
    gateway: { routingTable: { routes: [] } } as unknown as AgentsRouterDeps['gateway'],
    meter: {} as AgentsRouterDeps['meter'],
    feeAssetId: 'X',
  };
}

describe('assertUserLogPageLimit', () => {
  it('refuses blank / non-finite / <1 — never invent 100', () => {
    expect(() => assertUserLogPageLimit(undefined)).toThrow(AgentError);
    expect(() => assertUserLogPageLimit(Number.NaN)).toThrow(AgentError);
    expect(() => assertUserLogPageLimit(0)).toThrow(AgentError);
    try {
      assertUserLogPageLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(AgentError);
      expect((e as AgentError).code).toBe('agents.log_mine_limit_unset');
      expect((e as AgentError).message).not.toMatch(/default 100/i);
    }
  });

  it('accepts owner-published 100', () => {
    expect(assertUserLogPageLimit(100)).toBe(100);
  });
});

describe('log.mine public door', () => {
  it('omit / blank input refuses agents.log_mine_limit_unset — never calls userLog', async () => {
    const calls: number[] = [];
    const deps = stubDeps(async (_userId, limit) => {
      calls.push(limit);
      return [];
    });
    const caller = createAgentsRouter(deps).createCaller(signed());
    await expect(caller.log.mine()).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      cause: { code: 'agents.log_mine_limit_unset' },
    });
    await expect(caller.log.mine({})).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      cause: { code: 'agents.log_mine_limit_unset' },
    });
    expect(calls).toEqual([]);
  });

  it('owner-published 100 reaches userLog', async () => {
    const calls: Array<{ userId: string; limit: number }> = [];
    const deps = stubDeps(async (userId, limit) => {
      calls.push({ userId, limit });
      return [];
    });
    const result = await createAgentsRouter(deps).createCaller(signed()).log.mine({ limit: 100 });
    expect(result).toEqual([]);
    expect(calls).toEqual([{ userId: USER, limit: 100 }]);
  });

  it('source does not default 100 on log.mine / userLog / forUser', () => {
    const routerTs = readFileSync(join(HERE, 'router.ts'), 'utf8');
    const runtimeTs = readFileSync(join(HERE, 'runtime.ts'), 'utf8');
    const auditTs = readFileSync(join(HERE, 'fleet/audit.ts'), 'utf8');
    expect(routerTs).not.toMatch(/limit:\s*z\.number\(\)\.int\(\)\.min\(1\)\.max\(500\)\.default\(100\)/);
    expect(routerTs).toMatch(/assertUserLogPageLimit\(input\?\.limit\)/);
    expect(runtimeTs).not.toMatch(/userLog\(userId: string, limit = 100\)/);
    expect(auditTs).not.toMatch(/forUser\(userId: string, limit = 100\)/);
  });
});
