/**
 * S-A4 honesty — hermetic. No invent rates, no AMM marks, no admin rate knobs.
 * Maps SPEC-LENDING §1 / §4 / §7 without requiring anvil.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadArtifact } from '../chain/artifacts.js';

const here = dirname(fileURLToPath(import.meta.url));
const contractsDir = join(here, '..', '..', 'contracts');

function abiFnNames(name: 'IsolatedLendingMarket' | 'FailClosedOracle'): string[] {
  const names: string[] = [];
  for (const item of loadArtifact(name).abi) {
    if (item.type === 'function') names.push(item.name);
  }
  return names.sort();
}

describe('S-A4 honesty · no invent rates / no AMM oracle', () => {
  it('IsolatedLendingMarket.sol never reads an AMM / pool / swap price', () => {
    const src = readFileSync(join(contractsDir, 'lending/IsolatedLendingMarket.sol'), 'utf8');
    expect(src).not.toMatch(/\bConstantProductPool\b/);
    expect(src).not.toMatch(/\bPoolFactory\b/);
    expect(src).not.toMatch(/\bswapExactIn\b/);
    expect(src).not.toMatch(/\bgetReserves\b/);
    expect(src).toMatch(/oracle\.getMark/);
  });

  it('FailClosedOracle.sol has no AMM/pool read path and no fallback price', () => {
    const src = readFileSync(join(contractsDir, 'oracle/FailClosedOracle.sol'), 'utf8');
    // NatSpec may name AMM to refuse it — assert no callable pool/AMM coupling.
    expect(src).not.toMatch(/ConstantProductPool|PoolFactory|getReserves|swapExactIn/);
    expect(src).toMatch(/revert Disagreement/);
    expect(src).toMatch(/revert Stale/);
    expect(src).not.toMatch(/fallbackPrice|lastGood|cachedPrice/i);
  });

  it('rate curve params are immutable constructor inputs — no setRate admin surface', () => {
    const names = abiFnNames('IsolatedLendingMarket');
    for (const forbidden of ['setRate', 'setBaseRate', 'setOracle', 'setLtv', 'pause', 'setAdmin']) {
      expect(names, `mutable risk surface leaked: ${forbidden}`).not.toContain(forbidden);
    }
    for (const required of ['baseRateBps', 'slope1Bps', 'slope2Bps', 'kinkBps', 'maxLtvBps', 'closeFactorBps']) {
      expect(names).toContain(required);
    }
  });

  it('oracle ABI has report + getMark only for marks — no setPrice god-mode', () => {
    const names = abiFnNames('FailClosedOracle');
    expect(names).toContain('report');
    expect(names).toContain('getMark');
    expect(names).not.toContain('setPrice');
    expect(names).not.toContain('forceMark');
  });
});
