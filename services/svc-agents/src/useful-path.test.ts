import { describe, expect, it } from 'vitest';
import { AgentError, ProviderError } from './errors.js';
import { ModelGateway } from './gateway/gateway.js';
import { DEFAULT_ROUTING_TABLE, parseRoutingTable } from './gateway/routing.js';
import { MockModelProvider } from './providers/mock.js';
import { firstCompletionTask, runUsefulPath } from './useful-path.js';

/**
 * THE GATEWAY USEFUL PATH — Board Clear A-P5-AGENTS.
 *
 * Proves the existing gateway can answer a completion end-to-end with the
 * default routing table and the deterministic mock. No Postgres, no ledger,
 * no product agent registration: those are separate layers.
 *
 * Residual (honest, not claimed Done by this suite):
 *   · product agents (Navigator / Support / …) are not registered here
 *   · mock is not production inference
 *   · metering + audit need the runtime + DB path (covered in runtime.test.ts)
 */

describe('useful path on the existing gateway', () => {
  it('finds a completion task on the shipped default table', () => {
    const gateway = new ModelGateway([new MockModelProvider({ id: 'primary' })], DEFAULT_ROUTING_TABLE);
    const task = firstCompletionTask(gateway);
    expect(task).toBeTruthy();
    // Default table starts with navigator.plan — capability complete.
    expect(task).toBe('navigator.plan');
  });

  it('completes a probe message through the mock on the default table', async () => {
    const provider = new MockModelProvider({ id: 'primary' });
    const gateway = new ModelGateway([provider], DEFAULT_ROUTING_TABLE);

    const result = await runUsefulPath(gateway);

    expect(result.task).toBe('navigator.plan');
    expect(result.providerId).toBe('primary');
    expect(result.model).toBe('reasoning-lg'); // alias, not a vendor product id
    expect(result.text).toMatch(/^mock:reasoning-lg:/);
    expect(result.usage.inputTokens).toBeGreaterThan(0);
    expect(result.usage.outputTokens).toBeGreaterThan(0);
    expect(provider.callCount).toBe(1);
  });

  it('accepts an explicit task from the table', async () => {
    const gateway = new ModelGateway([new MockModelProvider({ id: 'primary' })], DEFAULT_ROUTING_TABLE);
    const result = await runUsefulPath(gateway, { task: 'support.classify' });
    expect(result.task).toBe('support.classify');
    expect(result.model).toBe('fast-sm');
  });

  it('refuses an unrouted task the same way the gateway does', async () => {
    const gateway = new ModelGateway([new MockModelProvider({ id: 'primary' })], DEFAULT_ROUTING_TABLE);
    await expect(runUsefulPath(gateway, { task: 'no.such.task' })).rejects.toBeInstanceOf(AgentError);
    await expect(runUsefulPath(gateway, { task: 'no.such.task' })).rejects.toMatchObject({
      code: 'agents.route_not_found',
    });
  });

  it('refuses when the provider is down — no fabricated answer', async () => {
    const provider = new MockModelProvider({
      id: 'primary',
      failWith: new ProviderError('outage', 'primary', true, 503),
    });
    const gateway = new ModelGateway([provider], DEFAULT_ROUTING_TABLE);

    await expect(runUsefulPath(gateway)).rejects.toBeInstanceOf(AgentError);
    await expect(runUsefulPath(gateway)).rejects.toMatchObject({
      code: 'agents.provider_unavailable',
    });
  });

  it('has no useful path when the table is embed-only', async () => {
    const table = parseRoutingTable({
      routes: [
        {
          task: 'index.embed',
          providerId: 'primary',
          model: 'embed-sm',
          maxOutputTokens: 1,
          price: { inputPerMillion: '0.1', outputPerMillion: '0' },
          capability: 'embed',
        },
      ],
    });
    const gateway = new ModelGateway([new MockModelProvider({ id: 'primary' })], table);
    expect(firstCompletionTask(gateway)).toBeNull();
    await expect(runUsefulPath(gateway)).rejects.toThrow(/no completion route/);
  });
});
