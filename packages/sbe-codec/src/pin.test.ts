import { describe, expect, it } from 'vitest';
import { readSbePin } from './pin.js';

describe('SBE.pin.json', () => {
  it('pins aeron-io/simple-binary-encoding 1.39.0 by commit SHA', () => {
    const pin = readSbePin();
    expect(pin.repo).toBe('aeron-io/simple-binary-encoding');
    expect(pin.version).toBe('1.39.0');
    expect(pin.tag).toBe('1.39.0');
    expect(pin.commit).toBe('e773b57cac6b2008ce30dd219a33de49766c6013');
    expect(pin.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(pin.license).toBe('Apache-2.0');
    expect(pin.maven).toBe('uk.co.real-logic:sbe-tool:1.39.0');
    expect(pin.role).toMatch(/adapter-only/);
    expect(pin.never).toEqual(
      expect.arrayContaining(['Protobuf-as-SBE', 'Aeron replacing NATS', 'hand-rolled SBE labeled as Real Logic', 'JS number money']),
    );
    expect(pin.keepInRepo).toEqual(expect.arrayContaining(['our schema', 'NATS', 'ledger-client']));
  });
});
