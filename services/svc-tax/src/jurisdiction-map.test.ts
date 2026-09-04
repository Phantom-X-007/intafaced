import { describe, expect, it } from 'vitest';
import { TAX_EXPORT_INCOMPLETE, TAX_JURISDICTION_MAP_INVALID, TAX_JURISDICTION_UNMAPPED, TaxError } from './codes.js';
import { parseJurisdictionMap, refuseExportCompleteness, requireMappedRegion } from './jurisdiction-map.js';

describe('parseJurisdictionMap', () => {
  it('blank / empty object / empty array are unmapped — never a default country', () => {
    expect(parseJurisdictionMap('')).toEqual({ kind: 'unmapped' });
    expect(parseJurisdictionMap('   ')).toEqual({ kind: 'unmapped' });
    expect(parseJurisdictionMap('{}')).toEqual({ kind: 'unmapped' });
    expect(parseJurisdictionMap('[]')).toEqual({ kind: 'unmapped' });
    expect(parseJurisdictionMap(undefined)).toEqual({ kind: 'unmapped' });
  });

  it('object keys and array entries become the mapped set', () => {
    const fromObj = parseJurisdictionMap('{"DE":{},"GB":{}}');
    expect(fromObj.kind).toBe('mapped');
    if (fromObj.kind === 'mapped') expect([...fromObj.regions].sort()).toEqual(['DE', 'GB']);

    const fromArr = parseJurisdictionMap('["DE","FR"]');
    expect(fromArr.kind).toBe('mapped');
    if (fromArr.kind === 'mapped') expect([...fromArr.regions].sort()).toEqual(['DE', 'FR']);
  });

  it('invalid JSON is a named refuse, not a silent country', () => {
    expect(() => parseJurisdictionMap('{de}')).toThrow(TaxError);
    try {
      parseJurisdictionMap('{de}');
    } catch (err) {
      expect((err as TaxError).code).toBe(TAX_JURISDICTION_MAP_INVALID);
    }
  });
});

describe('requireMappedRegion', () => {
  it('refuses unmapped and unknown regions with tax.jurisdiction_unmapped', () => {
    expect(() => requireMappedRegion({ kind: 'unmapped' }, 'DE')).toThrow(TaxError);
    try {
      requireMappedRegion({ kind: 'mapped', regions: new Set(['DE']) }, 'US');
    } catch (err) {
      expect((err as TaxError).code).toBe(TAX_JURISDICTION_UNMAPPED);
    }
  });

  it('accepts a mapped region without inventing a method', () => {
    expect(requireMappedRegion({ kind: 'mapped', regions: new Set(['DE']) }, 'de')).toBe('DE');
  });
});

describe('refuseExportCompleteness', () => {
  it('lets a pack proceed when completeness is not claimed', () => {
    expect(() => refuseExportCompleteness(undefined)).not.toThrow();
    expect(() => refuseExportCompleteness(false)).not.toThrow();
  });

  it('refuses complete:true — never invents jurisdictions to satisfy it', () => {
    expect(() => refuseExportCompleteness(true)).toThrow(TaxError);
    try {
      refuseExportCompleteness(true);
    } catch (err) {
      expect((err as TaxError).code).toBe(TAX_EXPORT_INCOMPLETE);
      expect((err as TaxError).message).not.toMatch(/\bUS\b|\bGB\b|\bFR\b/);
    }
    expect(parseJurisdictionMap('')).toEqual({ kind: 'unmapped' });
  });
});
