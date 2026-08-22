import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  connectDataLakeMountVsTrackerBoardCard,
  connectDataLakeTrackerBackendDoneBarMet,
  DATA_LAKE_HONEST_GAPS,
} from './mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('connect.data-lake tracker status pin', () => {
  it('honest gaps are closed and backend done bar is met', () => {
    expect(DATA_LAKE_HONEST_GAPS).toEqual([]);
    expect(connectDataLakeTrackerBackendDoneBarMet()).toBe(true);
    expect(connectDataLakeMountVsTrackerBoardCard().gaps).toBe(0);
  });

  it('features.mjs marks connect.data-lake done when product gaps are closed', () => {
    expect(trackerStatus('connect.data-lake')).toBe('done');
  });
});
