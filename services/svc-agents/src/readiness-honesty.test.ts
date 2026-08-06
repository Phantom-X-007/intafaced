import { describe, expect, it } from 'vitest';
import {
  usableCount,
  healthyCount,
  readinessBoardCard,
  readinessStatusLine,
  parseReadinessStatusLine,
  readinessStatusLineMatches,
  readinessStatusLineConsistent,
  readinessExportHeader,
  readinessExportLine,
  readinessExportText,
  mockUsefulImpliesResidual,
  providerCountInRange,
  type AgentsReadinessInput,
} from './readiness-honesty.js';

describe('L3 wave77 readiness honesty', () => {
  it('mock useful path and empty providers', () => {
    const empty: AgentsReadinessInput = {
      providerMode: 'mock',
      providers: [],
      meteringEnabled: false,
      tasks: [],
      usefulPath: { available: false, task: null, residual: 'no routes configured' },
    };
    expect(usableCount(empty)).toBe(0);
    expect(healthyCount(empty)).toBe(0);
    expect(readinessStatusLineMatches(empty)).toBe(true);
    expect(readinessStatusLineConsistent(readinessStatusLine(empty))).toBe(true);
    expect(mockUsefulImpliesResidual(empty)).toBe(true);
    expect(parseReadinessStatusLine('nope')).toBeNull();

    const mockUseful: AgentsReadinessInput = {
      providerMode: 'mock',
      providers: [
        { id: 'mock', usable: true, healthy: true },
        { id: 'up', usable: false, healthy: false },
      ],
      meteringEnabled: true,
      tasks: ['navigator.plan'],
      usefulPath: {
        available: true,
        task: 'navigator.plan',
        residual: 'engine is the deterministic mock — not production inference',
      },
    };
    expect(usableCount(mockUseful)).toBe(1);
    expect(healthyCount(mockUseful)).toBe(1);
    expect(readinessBoardCard(mockUseful)).toEqual({
      mode: 'mock',
      providers: 2,
      usable: 1,
      healthy: 1,
      tasks: 1,
      useful: 1,
      metering: 1,
      residualPresent: 1,
    });
    expect(readinessStatusLine(mockUseful)).toBe(
      'mode=mock providers=2 usable=1 healthy=1 tasks=1 useful=1 metering=1 residual=1',
    );
    expect(readinessStatusLineMatches(mockUseful)).toBe(true);
    expect(readinessExportText(mockUseful).startsWith(readinessExportHeader())).toBe(true);
    expect(readinessExportLine(mockUseful)).toBe('mock,2,1,1,1,1,1,1');
    expect(mockUsefulImpliesResidual(mockUseful)).toBe(true);
    expect(providerCountInRange(mockUseful, 2, 2)).toBe(true);
    expect(providerCountInRange(mockUseful, 3, 1)).toBe(false);

    const mockBad: AgentsReadinessInput = {
      ...mockUseful,
      usefulPath: { available: true, task: 'navigator.plan', residual: null },
    };
    expect(mockUsefulImpliesResidual(mockBad)).toBe(false);
  });
});
