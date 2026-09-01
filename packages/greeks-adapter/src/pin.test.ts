import { describe, expect, it } from 'vitest';
import { readQuantLibPin } from './pin.js';

describe('QUANTLIB.pin.json', () => {
  it('pins lballabio/QuantLib 1.43 by commit SHA', () => {
    const pin = readQuantLibPin();
    expect(pin.repo).toBe('lballabio/QuantLib');
    expect(pin.version).toBe('1.43');
    expect(pin.tag).toBe('v1.43');
    expect(pin.commit).toBe('6b57206e04598f092efee66e3b367efc84771995');
    expect(pin.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(pin.role).toMatch(/adapter-only/);
    expect(pin.never).toEqual(
      expect.arrayContaining(['QuantLib-Python hot path', 'IEEE NPV/Greeks on the wire', 'hand-rolled Black-Scholes labeled as QuantLib']),
    );
  });
});
