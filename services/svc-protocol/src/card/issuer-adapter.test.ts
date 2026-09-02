import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadArtifact } from '../chain/artifacts.js';
import { buildKillCalldata, buildPullExactCalldata, ISSUER_SECRET_ENV, refuseIssuerSecrets } from './issuer-adapter.js';

const here = dirname(fileURLToPath(import.meta.url));
const adapterSrc = readFileSync(join(here, 'issuer-adapter.ts'), 'utf8');
const ifaceSrc = readFileSync(join(here, '..', '..', 'contracts/interfaces/ICardPull.sol'), 'utf8');
const pullSrc = readFileSync(join(here, '..', '..', 'contracts/card/CardPull.sol'), 'utf8');

describe('S-E3 CardIssuer on-chain adapter — no keys', () => {
  it('CardPull implements ICardPull and ICardPull has no issuer-key surface', () => {
    expect(pullSrc).toMatch(/contract CardPull is ICardPull/);
    expect(ifaceSrc).toMatch(/function pullExact\(uint256 amount\)/);
    expect(ifaceSrc).not.toMatch(/function\s+pause/);
    expect(ifaceSrc).not.toMatch(/privateKey|mnemonic|issuerKey/i);
  });

  it('CardPull ABI covers the ICardPull selectors', () => {
    const names = loadArtifact('CardPull')
      .abi.filter((item) => item.type === 'function')
      .map((item) => item.name);
    for (const fn of ['owner', 'token', 'settlement', 'killed', 'pullExact', 'setSettlement', 'kill']) {
      expect(names, `missing ${fn}`).toContain(fn);
    }
  });

  it('builds pullExact / kill calldata without a key', () => {
    const pull = buildPullExactCalldata(1n);
    expect(pull.startsWith('0x')).toBe(true);
    expect(buildKillCalldata().startsWith('0x')).toBe(true);
  });

  it('refuses a zero amount (no invent)', () => {
    expect(() => buildPullExactCalldata(0n)).toThrow('card.bad_amount');
  });

  it('refuses issuer secret env keys', () => {
    expect(() => refuseIssuerSecrets({ ISSUER_PRIVATE_KEY: '0xabc' })).toThrow('card.issuer_key_forbidden');
    refuseIssuerSecrets({});
    expect(adapterSrc).not.toMatch(/process\.env/);
    for (const key of ISSUER_SECRET_ENV) {
      expect(adapterSrc).toContain(key);
    }
  });
});
