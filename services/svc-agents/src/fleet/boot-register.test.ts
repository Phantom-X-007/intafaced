import { describe, expect, it } from 'vitest';
import { parseGuardrail, PRODUCT_AGENT_IDS, type Guardrail } from './guardrails.js';
import { FLEET_PRODUCT_AGENTS } from './matrix.js';
import {
  bootRegisterAgentIds,
  bootRegisterCoversProductIds,
  registerProductAgentsAtBoot,
  type BootRegisterRuntime,
} from './boot-register.js';

function fakeRuntime(): BootRegisterRuntime & { calls: unknown[]; byId: Map<string, Guardrail> } {
  const byId = new Map<string, Guardrail>();
  const calls: unknown[] = [];
  return {
    calls,
    byId,
    async registerAgent(input: unknown) {
      calls.push(input);
      const g = parseGuardrail(input);
      byId.set(g.agentId, g);
      return g;
    },
  };
}

describe('registerProductAgentsAtBoot', () => {
  it('registers every product factory in matrix order', async () => {
    const rt = fakeRuntime();
    const result = await registerProductAgentsAtBoot(rt);

    expect(result.count).toBe(PRODUCT_AGENT_IDS.length);
    expect(result.registered).toEqual(FLEET_PRODUCT_AGENTS.map((r) => r.agentId));
    expect(rt.calls).toHaveLength(PRODUCT_AGENT_IDS.length);
    for (const id of PRODUCT_AGENT_IDS) {
      expect(rt.byId.get(id)?.agentId).toBe(id);
    }
  });

  it('is idempotent — second boot re-upserts the same ids', async () => {
    const rt = fakeRuntime();
    await registerProductAgentsAtBoot(rt);
    const second = await registerProductAgentsAtBoot(rt);
    expect(second.registered).toEqual(firstIds());
    expect(rt.calls).toHaveLength(PRODUCT_AGENT_IDS.length * 2);
    expect(rt.byId.size).toBe(PRODUCT_AGENT_IDS.length);
  });

  it('refuses a matrix row whose factory lies about agentId', async () => {
    const rt = fakeRuntime();
    await expect(
      registerProductAgentsAtBoot(rt, [
        {
          agentId: 'scanner',
          factory: () =>
            parseGuardrail({
              agentId: 'navigator',
              version: 1,
              tools: [{ name: 'trade.quote', module: 'trade', mode: 'read' }],
              limits: {
                maxActionsPerSession: 1,
                maxOutputTokensPerCall: 1,
                maxSpendPerSession: '0',
                allowedModules: ['trade'],
                allowedTasks: ['scanner.rank'],
              },
            }),
          runSessionMounted: true,
          bootRegistered: true,
        },
      ]),
    ).rejects.toThrow(/does not match factory/);
    expect(rt.calls).toHaveLength(0);
  });

  it('pure helpers cover the sealed product set', () => {
    expect(bootRegisterCoversProductIds()).toBe(true);
    expect([...bootRegisterAgentIds()].sort()).toEqual([...PRODUCT_AGENT_IDS].sort());
  });
});

function firstIds(): string[] {
  return FLEET_PRODUCT_AGENTS.map((r) => r.agentId);
}
