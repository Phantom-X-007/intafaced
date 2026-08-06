import { describe, expect, it } from 'vitest';
import { COPY_KEYS } from './copy.js';
import {
  copyKeyGroupHistogram,
  copyKeysWithAgentsPrefix,
  copyCatalogBoardCard,
  copyCatalogStatusLine,
  parseCopyCatalogStatusLine,
  copyCatalogStatusLineMatches,
  copyCatalogStatusLineConsistent,
  copyCatalogExportHeader,
  copyCatalogExportLine,
  copyCatalogExportText,
  copyCatalogAllAgentsPrefixed,
  copyCatalogHasKey,
  copyKeyCountInRange,
} from './copy-catalog-honesty.js';

describe('L3 wave88 agents copy catalog honesty', () => {
  it('declared COPY_KEYS boards', () => {
    const keys = COPY_KEYS;
    expect(keys.length).toBeGreaterThan(10);
    expect(copyKeysWithAgentsPrefix(keys)).toBe(keys.length);
    expect(copyCatalogAllAgentsPrefixed(keys)).toBe(true);
    const card = copyCatalogBoardCard(keys);
    expect(card.keys).toBe(keys.length);
    expect(card.agentsPrefix).toBe(keys.length);
    expect(card.refused).toBeGreaterThan(0);
    expect(card.error).toBeGreaterThan(0);
    expect(copyCatalogStatusLineMatches(keys)).toBe(true);
    expect(copyCatalogStatusLineConsistent(copyCatalogStatusLine(keys))).toBe(true);
    expect(copyCatalogExportText(keys).startsWith(copyCatalogExportHeader())).toBe(true);
    expect(copyCatalogExportLine(keys).startsWith(`${keys.length},`)).toBe(true);
    expect(copyCatalogHasKey(keys, 'agents.merchant.unavailable')).toBe(true);
    expect(copyCatalogHasKey(keys, 'agents.vendor.openai')).toBe(false);
    expect(copyKeyGroupHistogram(keys).merchant).toBeGreaterThan(0);
    expect(copyKeyCountInRange(keys, keys.length, keys.length)).toBe(true);
    expect(copyKeyCountInRange(keys, keys.length + 1, 1)).toBe(false);
    expect(parseCopyCatalogStatusLine('nope')).toBeNull();

    const empty: readonly string[] = [];
    expect(copyCatalogBoardCard(empty).keys).toBe(0);
    expect(copyCatalogAllAgentsPrefixed(empty)).toBe(false);
    expect(copyCatalogStatusLineMatches(empty)).toBe(true);
  });
});
