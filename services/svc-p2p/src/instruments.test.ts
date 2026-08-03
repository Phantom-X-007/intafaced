import { describe, expect, it } from 'vitest';
import {
  ANY_COUNTRY,
  InstrumentError,
  MAX_PATTERN_LENGTH,
  MAX_VALUE_LENGTH,
  fingerprintDetails,
  normaliseCountry,
  normaliseMethodId,
  parseFieldSpecs,
  pickSchema,
  validateDetails,
  type MethodSchema,
} from './instruments.js';

/**
 * THE FIELD RULES — pure, no database, exhaustive.
 *
 * These are the rules an operator's method schema is held to, and the rules a
 * user's account details are then held to against it. Both halves are here
 * because both are places where being lenient produces something worse than an
 * error: a schema that quietly accepts nonsense rejects every real user
 * afterwards, and details that quietly accept an undeclared field give us
 * personal data nobody designed, validates, protects or deletes.
 *
 * Nothing in this file names a real payment method or a real market's
 * requirements. That is the whole design — see `instruments.ts`.
 */

const schema = (fields: unknown[], overrides: Partial<MethodSchema> = {}): MethodSchema => ({
  methodId: 'test-method',
  country: ANY_COUNTRY,
  label: 'Test method',
  enabled: true,
  fields: parseFieldSpecs(fields),
  ...overrides,
});

describe('normalising the keys of the registry', () => {
  it('accepts an alpha-2 country and the wildcard, and nothing else', () => {
    expect(normaliseCountry('de')).toBe('DE');
    expect(normaliseCountry(' ng ')).toBe('NG');
    expect(normaliseCountry(ANY_COUNTRY)).toBe(ANY_COUNTRY);

    for (const bad of ['DEU', 'D', '', '12', 'D1']) {
      expect(() => normaliseCountry(bad)).toThrow(InstrumentError);
    }
  });

  it('accepts a method id that can safely be a key, and nothing else', () => {
    expect(normaliseMethodId('Bank-Transfer_2')).toBe('bank-transfer_2');
    for (const bad of ['', '2fast', 'has space', 'has/slash', 'a'.repeat(65)]) {
      expect(() => normaliseMethodId(bad)).toThrow(InstrumentError);
    }
  });
});

describe('an operator’s field list', () => {
  it('needs at least one field', () => {
    // A schema with no fields accepts an instrument with no details — a
    // destination with no address, which is the exact bug this exists to stop.
    expect(() => parseFieldSpecs([])).toThrow(/at least one field/);
    expect(() => parseFieldSpecs('not a list')).toThrow(InstrumentError);
  });

  it('defaults a field to required', () => {
    // The safe default. An optional-by-default field list produces instruments
    // that pass validation and cannot be paid.
    expect(parseFieldSpecs([{ key: 'a', label: 'A' }])[0]!.required).toBe(true);
    expect(parseFieldSpecs([{ key: 'a', label: 'A', required: false }])[0]!.required).toBe(false);
  });

  it('rejects a duplicate key, a missing label and an unusable key', () => {
    expect(() =>
      parseFieldSpecs([
        { key: 'a', label: 'A' },
        { key: 'a', label: 'Also A' },
      ]),
    ).toThrow(/declared twice/);
    expect(() => parseFieldSpecs([{ key: 'a', label: '  ' }])).toThrow(/label/);
    expect(() => parseFieldSpecs([{ key: 'Not A Key', label: 'A' }])).toThrow(/not a usable field key/);
  });

  it('compiles the pattern at registration, in front of the operator', () => {
    // Otherwise a broken pattern fails at every user's first attempt to save,
    // where nobody can tell whether they typed something wrong or we did.
    expect(() => parseFieldSpecs([{ key: 'a', label: 'A', pattern: '[unclosed' }])).toThrow(/valid regular expression/);
    expect(() => parseFieldSpecs([{ key: 'a', label: 'A', pattern: 'x'.repeat(MAX_PATTERN_LENGTH + 1) }])).toThrow(/longer than/);
    expect(parseFieldSpecs([{ key: 'a', label: 'A', pattern: '[0-9]{4}' }])[0]!.pattern).toBe('[0-9]{4}');
  });

  it('rejects nonsensical length bounds', () => {
    expect(() => parseFieldSpecs([{ key: 'a', label: 'A', minLength: 10, maxLength: 4 }])).toThrow(/minLength above maxLength/);
    expect(() => parseFieldSpecs([{ key: 'a', label: 'A', maxLength: 0 }])).toThrow(/outside/);
    expect(() => parseFieldSpecs([{ key: 'a', label: 'A', minLength: 1.5 }])).toThrow(/outside/);
  });
});

describe('a user’s details, against that list', () => {
  const s = schema([
    { key: 'account_reference', label: 'Account reference', required: true, minLength: 4 },
    { key: 'holder_name', label: 'Account holder', required: true },
    { key: 'note', label: 'Note', required: false, maxLength: 10 },
  ]);

  it('accepts exactly the declared fields, trimmed', () => {
    expect(validateDetails(s, { account_reference: '  1234  ', holder_name: 'A Person' })).toEqual({
      account_reference: '1234',
      holder_name: 'A Person',
    });
  });

  it('rejects an undeclared key rather than dropping it', () => {
    // Dropping it silently is how a blob nobody designed ends up holding
    // personal data nobody validates and nobody can enumerate later.
    expect(() => validateDetails(s, { account_reference: '1234', holder_name: 'A', date_of_birth: '1990-01-01' })).toThrow(
      /declares no field "date_of_birth"/,
    );
  });

  it('treats a blank required field as missing', () => {
    for (const blank of ['', '   ', '\t\n']) {
      expect(() => validateDetails(s, { account_reference: blank, holder_name: 'A' })).toThrow(/required/);
    }
  });

  it('lets an optional field be absent, and drops it rather than storing ""', () => {
    const out = validateDetails(s, { account_reference: '1234', holder_name: 'A', note: '  ' });
    expect(Object.keys(out)).toEqual(['account_reference', 'holder_name']);
  });

  it('enforces the operator’s lengths and pattern', () => {
    expect(() => validateDetails(s, { account_reference: '12', holder_name: 'A' })).toThrow(/shorter than 4/);
    expect(() => validateDetails(s, { account_reference: '1234', holder_name: 'A', note: 'x'.repeat(11) })).toThrow(/longer than 10/);
    expect(() => validateDetails(s, { account_reference: '1234', holder_name: 'A', note: 'x'.repeat(MAX_VALUE_LENGTH + 1) })).toThrow(
      /longer than/,
    );

    const patterned = schema([{ key: 'code', label: 'Code', pattern: '[0-9]{4}' }]);
    expect(validateDetails(patterned, { code: '1234' })).toEqual({ code: '1234' });
    // Anchored whether or not the operator anchored it. A half-anchored pattern
    // is not a validation — '1234abcd' would sail through an unanchored one.
    expect(() => validateDetails(patterned, { code: '1234abcd' })).toThrow(/expected format/);
    expect(() => validateDetails(schema([{ key: 'code', label: 'Code', pattern: '^[0-9]{4}$' }]), { code: 'x1234' })).toThrow();
  });

  it('never puts the value in the error message', () => {
    // An error string is the one place personal data escapes into a log without
    // anyone deciding that it should.
    try {
      validateDetails(schema([{ key: 'code', label: 'Code', pattern: '[0-9]{4}' }]), { code: 'DE89370400440532013000' });
      throw new Error('should have thrown');
    } catch (err) {
      expect((err as Error).message).not.toContain('DE89370400440532013000');
      expect((err as InstrumentError).field).toBe('code');
    }
  });

  it('rejects a non-string value and a non-object payload', () => {
    expect(() => validateDetails(s, { account_reference: 1234, holder_name: 'A' })).toThrow(/must be text/);
    expect(() => validateDetails(s, ['1234'])).toThrow(InstrumentError);
    expect(() => validateDetails(s, null)).toThrow(InstrumentError);
  });
});

describe('the fingerprint', () => {
  const details = { b: '2', a: '1' };

  it('does not depend on key order', () => {
    expect(fingerprintDetails('m', 'DE', details)).toBe(fingerprintDetails('m', 'DE', { a: '1', b: '2' }));
  });

  it('changes when the destination changes', () => {
    // This is what makes a mid-trade account swap visible after the fact: two
    // snapshots on one seller's trades with different fingerprints.
    expect(fingerprintDetails('m', 'DE', details)).not.toBe(fingerprintDetails('m', 'DE', { a: '1', b: '3' }));
    expect(fingerprintDetails('m', 'DE', details)).not.toBe(fingerprintDetails('m', 'NG', details));
    expect(fingerprintDetails('m', 'DE', details)).not.toBe(fingerprintDetails('other', 'DE', details));
  });

  it('is a sha256 hex digest', () => {
    expect(fingerprintDetails('m', 'DE', details)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('picking the schema that applies', () => {
  const wildcard = schema([{ key: 'a', label: 'A' }]);
  const specific = schema([{ key: 'b', label: 'B' }], { country: 'NG' });

  it('prefers an exact country over the wildcard', () => {
    // The specific entry is the operator saying "this market is different".
    // Falling back past it accepts a destination that market cannot receive at.
    expect(pickSchema([wildcard, specific], 'test-method', 'NG')).toBe(specific);
    expect(pickSchema([specific, wildcard], 'test-method', 'NG')).toBe(specific);
  });

  it('falls back to the wildcard only where there is no specific entry', () => {
    expect(pickSchema([wildcard, specific], 'test-method', 'DE')).toBe(wildcard);
  });

  it('returns null rather than a near miss', () => {
    expect(pickSchema([specific], 'test-method', 'DE')).toBeNull();
    expect(pickSchema([wildcard], 'another-method', 'DE')).toBeNull();
  });
});
