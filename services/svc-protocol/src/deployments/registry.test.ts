import { describe, expect, it } from 'vitest';
import { exampleRegistryPath, loadDeploymentRegistry, parseDeploymentRegistry } from './registry.js';

describe('deployment registry (S-A13)', () => {
  it('parses the example artefact', () => {
    const reg = loadDeploymentRegistry(exampleRegistryPath());
    expect(reg.chainId).toBe(31337);
    expect(reg.contracts[0]?.name).toBe('FailClosedOracle');
    expect(reg.contracts[0]?.verified).toBe(false);
  });

  it('refuses a zero-address-shaped missing sourceHash', () => {
    expect(() =>
      parseDeploymentRegistry({
        chainId: 1,
        chainName: 'x',
        contracts: [{ name: 'X', address: '0x1', sourceHash: 'nope', suite: 'amm' }],
      }),
    ).toThrow();
  });
});
