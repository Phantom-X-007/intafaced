import { describe, expect, it } from 'vitest';
import {
  providerCapabilityCatalogBoardCard,
  providerCapabilityCatalogStatusLine,
  parseProviderCapabilityCatalogStatusLine,
  providerCapabilityCatalogStatusLineMatches,
  providerCapabilityCatalogStatusLineConsistent,
  providerCapabilityCatalogExportHeader,
  providerCapabilityCatalogExportLines,
  providerCapabilityCatalogExportText,
  isDeclaredProviderCapability,
  PROVIDER_CAPABILITIES,
} from './capability-honesty.js';

describe('L3 wave167 provider capability catalog honesty', () => {
  it('capability catalog boards', () => {
    expect(PROVIDER_CAPABILITIES).toEqual(['complete', 'stream', 'embed']);
    expect(providerCapabilityCatalogBoardCard()).toEqual({
      capabilities: 3,
      hasComplete: 1,
      hasStream: 1,
      hasEmbed: 1,
    });
    expect(providerCapabilityCatalogStatusLine()).toBe('capabilities=3 complete=1 stream=1 embed=1');
    expect(providerCapabilityCatalogStatusLineMatches()).toBe(true);
    expect(providerCapabilityCatalogStatusLineConsistent(providerCapabilityCatalogStatusLine())).toBe(true);
    expect(providerCapabilityCatalogExportText().startsWith(providerCapabilityCatalogExportHeader())).toBe(true);
    expect(providerCapabilityCatalogExportLines()).toEqual([...PROVIDER_CAPABILITIES]);
    expect(isDeclaredProviderCapability('stream')).toBe(true);
    expect(isDeclaredProviderCapability('vision')).toBe(false);
    expect(parseProviderCapabilityCatalogStatusLine('nope')).toBeNull();
  });
});
