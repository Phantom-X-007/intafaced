import { describe, expect, it } from 'vitest';
import {
  providerCapabilityCatalogBoardCard,
  providerCapabilityCatalogStatusLine,
  parseProviderCapabilityCatalogStatusLine,
  providerCapabilityCatalogStatusLineMatches,
  providerCapabilityCatalogStatusLineConsistent,
  providerListBoardCard,
  providerListStatusLine,
  parseProviderListStatusLine,
  providerListStatusLineMatches,
  providerListStatusLineConsistent,
  providerListExportHeader,
  providerListExportLine,
  providerListExportText,
  isDeclaredProviderCapability,
  providerCountInRange,
  PROVIDER_CAPABILITIES,
  type ProviderHealthBoardInput,
} from './provider-catalog-honesty.js';

describe('L3 wave104 provider catalog honesty', () => {
  it('capability catalog and provider list boards', () => {
    expect(PROVIDER_CAPABILITIES).toEqual(['complete', 'stream', 'embed']);
    expect(providerCapabilityCatalogBoardCard()).toEqual({
      capabilities: 3,
      hasComplete: 1,
      hasStream: 1,
      hasEmbed: 1,
    });
    expect(providerCapabilityCatalogStatusLineMatches()).toBe(true);
    expect(
      providerCapabilityCatalogStatusLineConsistent(providerCapabilityCatalogStatusLine()),
    ).toBe(true);
    expect(isDeclaredProviderCapability('complete')).toBe(true);
    expect(isDeclaredProviderCapability('imagine')).toBe(false);
    expect(parseProviderCapabilityCatalogStatusLine('nope')).toBeNull();

    const empty: readonly ProviderHealthBoardInput[] = [];
    expect(providerListBoardCard(empty).providers).toBe(0);
    expect(providerListStatusLineMatches(empty)).toBe(true);

    const list: readonly ProviderHealthBoardInput[] = [
      {
        id: 'mock',
        healthy: true,
        usable: true,
        capabilities: ['complete', 'stream'],
      },
      {
        id: 'up',
        healthy: false,
        usable: false,
        capabilities: ['embed'],
      },
    ];
    expect(providerListBoardCard(list)).toEqual({
      providers: 2,
      healthy: 1,
      usable: 1,
      withComplete: 1,
    });
    expect(providerListStatusLine(list)).toBe(
      'providers=2 healthy=1 usable=1 with_complete=1',
    );
    expect(providerListStatusLineMatches(list)).toBe(true);
    expect(providerListStatusLineConsistent(providerListStatusLine(list))).toBe(true);
    expect(providerListExportText(list).startsWith(providerListExportHeader())).toBe(true);
    expect(providerListExportLine(list)).toBe('2,1,1,1');
    expect(providerCountInRange(list, 2, 2)).toBe(true);
    expect(parseProviderListStatusLine('nope')).toBeNull();
  });
});
