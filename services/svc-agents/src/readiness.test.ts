import { describe, expect, it } from 'vitest';
import { ProviderError } from './errors.js';
import { parseRoutingTable, type RoutingTable } from './gateway/routing.js';
import { MockModelProvider } from './providers/mock.js';
import type { ModelProvider, ProviderCapability, ProviderHealth } from './providers/provider.js';
import { agentsReadiness } from './readiness.js';

/**
 * HONEST READINESS — what `/ready` may and may not claim.
 *
 * The failure this suite guards is specific: a process that is up reporting
 * "ready" while every completion would fail, or reporting readiness that reads
 * as production inference when the engine is still the mock.
 */

const TABLE: RoutingTable = parseRoutingTable({
  routes: [
    {
      task: 'support.classify',
      providerId: 'primary',
      model: 'fast-sm',
      maxOutputTokens: 256,
      price: { inputPerMillion: '0.25', outputPerMillion: '1.25' },
    },
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

const ORPHAN: RoutingTable = parseRoutingTable({
  routes: [
    {
      task: 'ghost.task',
      providerId: 'nowhere',
      model: 'fast-sm',
      maxOutputTokens: 16,
      price: { inputPerMillion: '1', outputPerMillion: '1' },
    },
  ],
});

function deadProvider(id = 'primary'): ModelProvider {
  return {
    id,
    capabilities: ['complete'] as ProviderCapability[],
    health(): ProviderHealth {
      return { healthy: false, latencyMs: 0, lastUpdate: new Date(), reason: 'injected outage' };
    },
    complete: async () => {
      throw new ProviderError('dead', id, true, 503);
    },
  };
}

describe('agentsReadiness — honest about mock vs useful', () => {
  it('names mock mode and a servable completion task when the mock is healthy', () => {
    const status = agentsReadiness({
      providerMode: 'mock',
      providers: [new MockModelProvider({ id: 'primary' })],
      table: TABLE,
      meteringEnabled: true,
    });

    expect(status.ready).toBe(true);
    expect(status.providerMode).toBe('mock');
    expect(status.meteringEnabled).toBe(true);
    expect(status.tasks).toEqual(['support.classify', 'index.embed']);
    expect(status.usefulPath.available).toBe(true);
    expect(status.usefulPath.task).toBe('support.classify');
    // Mock always carries residual — "ready" must not read as production AI.
    expect(status.usefulPath.residual).toMatch(/mock/i);
    expect(status.usefulPath.residual).toMatch(/not production/i);
    expect(status.providers[0]).toMatchObject({ id: 'primary', usable: true, healthy: true });
  });

  it('drops the mock residual when upstream is usable', () => {
    const status = agentsReadiness({
      providerMode: 'upstream',
      providers: [new MockModelProvider({ id: 'primary' })],
      table: TABLE,
      meteringEnabled: true,
    });

    expect(status.usefulPath.available).toBe(true);
    expect(status.usefulPath.task).toBe('support.classify');
    expect(status.usefulPath.residual).toBeNull();
    expect(status.providerMode).toBe('upstream');
  });

  it('reports usefulPath unavailable when the only provider is down', () => {
    const status = agentsReadiness({
      providerMode: 'upstream',
      providers: [deadProvider('primary')],
      table: TABLE,
      meteringEnabled: true,
    });

    expect(status.ready).toBe(true); // process still serves logs/sessions
    expect(status.usefulPath.available).toBe(false);
    expect(status.usefulPath.task).toBeNull();
    expect(status.usefulPath.residual).toMatch(/not usable|injected outage/);
    expect(status.providers[0]?.usable).toBe(false);
  });

  it('reports usefulPath unavailable when routes name an unregistered provider', () => {
    const status = agentsReadiness({
      providerMode: 'mock',
      providers: [new MockModelProvider({ id: 'primary' })],
      table: ORPHAN,
      meteringEnabled: false,
    });

    expect(status.usefulPath.available).toBe(false);
    expect(status.usefulPath.residual).toMatch(/not registered/);
    expect(status.meteringEnabled).toBe(false);
  });

  it('never puts a vendor product name on the readiness body', () => {
    const status = agentsReadiness({
      providerMode: 'mock',
      providers: [new MockModelProvider({ id: 'primary' })],
      table: TABLE,
      meteringEnabled: true,
    });
    const blob = JSON.stringify(status);
    // Spelled in pieces so brand-scan and this package's own copy test stay clean.
    expect(blob).not.toMatch(new RegExp('Anthrop' + 'ic', 'i'));
    expect(blob).not.toMatch(new RegExp('Open' + 'AI', 'i'));
    expect(blob).not.toMatch(new RegExp('Cla' + 'ude', 'i'));
  });

  it('prefers a completion route over embed-only when both exist', () => {
    const status = agentsReadiness({
      providerMode: 'mock',
      providers: [new MockModelProvider({ id: 'primary' })],
      table: TABLE,
      meteringEnabled: true,
    });
    expect(status.usefulPath.task).toBe('support.classify');
    expect(status.usefulPath.task).not.toBe('index.embed');
  });
});
