/**
 * S-C1 honesty — hermetic. Real book, not DevVenue. Nobody can publish a fake fill.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toEventSignature, type AbiEvent } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '..', '..', 'contracts/venue/SovereignVenue.sol'), 'utf8');

function abiFnNames(): string[] {
  const names: string[] = [];
  for (const item of loadArtifact('SovereignVenue').abi) {
    if (item.type === 'function') names.push(item.name);
  }
  return names.sort();
}

function eventSig(name: string): string {
  const ev = loadArtifact('SovereignVenue').abi.find((item) => item.type === 'event' && item.name === name);
  if (!ev || ev.type !== 'event') throw new Error(`missing event ${name}`);
  return toEventSignature(ev as AbiEvent);
}

describe('S-C1 honesty · SovereignVenue is not DevVenue', () => {
  it('source has matching + custody, not a public log emitter', () => {
    expect(src).not.toMatch(/function\s+publishLevel\b/);
    expect(src).not.toMatch(/function\s+recordFill\b/);
    expect(src).not.toMatch(/function\s+publishPosition\b/);
    expect(src).not.toMatch(/function\s+pause\b/);
    expect(src).toMatch(/function place\(/);
    expect(src).toMatch(/function cancel\(/);
    expect(src).toMatch(/THIS IS A REAL BOOK/);
  });

  it('ABI has no fake-publish surface and no admin', () => {
    const names = abiFnNames();
    for (const forbidden of ['publishLevel', 'recordFill', 'publishPosition', 'publishAll', 'pause', 'setAdmin', 'setFee', 'setOwner']) {
      expect(names, `leaked control: ${forbidden}`).not.toContain(forbidden);
    }
    for (const required of ['place', 'cancel', 'deposit', 'withdraw', 'takerFeeBps', 'settlementCostQuote']) {
      expect(names).toContain(required);
    }
  });

  it('emits the indexer venue surface (BookLevel / Fill / Position)', () => {
    expect(eventSig('BookLevel')).toBe('BookLevel(bytes32,uint8,uint256,uint256)');
    expect(eventSig('Fill')).toBe('Fill(bytes32,address,address,uint256,uint256,uint8)');
    expect(eventSig('Position')).toBe('Position(bytes32,address,int256,uint256)');
  });

  it('settlementCostQuote is a pure zero — this venue does not understate a hidden quote fee', () => {
    expect(src).toMatch(/function settlementCostQuote\(\) external pure returns \(uint256\)/);
    expect(src).toMatch(/return 0;/);
  });
});
