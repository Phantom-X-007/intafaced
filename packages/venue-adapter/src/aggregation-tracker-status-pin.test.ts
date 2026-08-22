import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  VENUE_AGGREGATION_HONEST_GAPS,
  venueAggregationMountVsTrackerBoardCard,
  venueAggregationTrackerBackendDoneBarMet,
} from './aggregation-mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('venue.aggregation tracker status pin', () => {
  it('honest gaps are closed and backend done bar is met', () => {
    expect(VENUE_AGGREGATION_HONEST_GAPS).toEqual([]);
    expect(venueAggregationTrackerBackendDoneBarMet()).toBe(true);
    expect(venueAggregationMountVsTrackerBoardCard().gaps).toBe(0);
  });

  it('features.mjs marks venue.aggregation done when product gaps are closed', () => {
    expect(trackerStatus('venue.aggregation')).toBe('done');
  });
});
