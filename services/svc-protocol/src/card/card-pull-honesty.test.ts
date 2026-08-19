/**
 * S-E1 honesty — JIT pull never holds a balance; kill strands zero; no issuer key.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toFunctionSelector } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';
import { isOutboundTransferSelector } from '../session/spec.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', '..', 'contracts/card/CardPull.sol'), 'utf8');

describe('S-E1 CardPull — issuer never holds, kill strands zero', () => {
  it('pullExact is transferFrom owner to settlement, not a hold in this contract', () => {
    expect(src).toMatch(/transferFrom\(owner, settlement, amount\)/);
    expect(src).not.toMatch(/function\s+pause/);
    expect(src).not.toMatch(/function\s+upgradeTo/);
  });

  it('ABI is owner pull/kill/settlement only', () => {
    const names = loadArtifact('CardPull')
      .abi.filter((item) => item.type === 'function')
      .map((item) => item.name)
      .sort();
    expect(names).toContain('pullExact');
    expect(names).toContain('kill');
    expect(names).toContain('setSettlement');
    expect(names).not.toContain('pause');
    expect(names).not.toContain('mint');
  });

  it('pullExact is not an outbound session-key transfer selector', () => {
    const selector = toFunctionSelector('pullExact(uint256)');
    expect(isOutboundTransferSelector(selector)).toBe(false);
  });
});
