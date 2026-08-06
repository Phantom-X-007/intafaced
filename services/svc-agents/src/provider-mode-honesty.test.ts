import { describe, expect, it } from 'vitest';
import {
  providerModeCatalogBoardCard,
  providerModeCatalogStatusLine,
  parseProviderModeCatalogStatusLine,
  providerModeCatalogStatusLineMatches,
  providerModeCatalogStatusLineConsistent,
  mockModeRequiresResidualBoard,
  providerModeCatalogExportHeader,
  providerModeCatalogExportLines,
  providerModeCatalogExportText,
  isDeclaredProviderMode,
  PROVIDER_MODES,
} from './provider-mode-honesty.js';

describe('L3 wave144 provider mode honesty', () => {
  it('mode catalog and mock residual law', () => {
    expect(PROVIDER_MODES).toEqual(['mock', 'upstream']);
    expect(providerModeCatalogBoardCard()).toEqual({
      modes: 2,
      hasMock: 1,
      hasUpstream: 1,
    });
    expect(providerModeCatalogStatusLine()).toBe('modes=2 mock=1 upstream=1');
    expect(providerModeCatalogStatusLineMatches()).toBe(true);
    expect(providerModeCatalogStatusLineConsistent(providerModeCatalogStatusLine())).toBe(true);
    expect(providerModeCatalogExportText().startsWith(providerModeCatalogExportHeader())).toBe(
      true,
    );
    expect(providerModeCatalogExportLines()).toEqual([...PROVIDER_MODES]);
    expect(isDeclaredProviderMode('mock')).toBe(true);
    expect(isDeclaredProviderMode('live')).toBe(false);
    expect(mockModeRequiresResidualBoard('mock', true, true)).toBe(true);
    expect(mockModeRequiresResidualBoard('mock', true, false)).toBe(false);
    expect(mockModeRequiresResidualBoard('upstream', true, false)).toBe(true);
    expect(parseProviderModeCatalogStatusLine('nope')).toBeNull();
  });
});
