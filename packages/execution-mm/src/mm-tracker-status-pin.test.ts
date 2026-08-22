import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXECUTION_MM_TRACKER_ID,
  executionMmMountVsTrackerBoardCard,
  executionMmTrackerBackendDoneBarMet,
  MM_HONEST_GAPS,
  mmSpreadSkewBandsGapsClosed,
} from './mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('execution.market-making tracker status pin', () => {
  it('spread/skew compose gap closed; internal half remains ADR-blocked', () => {
    expect(mmSpreadSkewBandsGapsClosed()).toBe(true);
    expect(MM_HONEST_GAPS).toEqual(['gap.internal_venue_mm_blocked']);
    expect(executionMmTrackerBackendDoneBarMet()).toBe(true);
    expect(executionMmMountVsTrackerBoardCard().gaps).toBe(1);
  });

  it('features.mjs marks execution.market-making done when external half ships', () => {
    expect(EXECUTION_MM_TRACKER_ID).toBe('execution.market-making');
    expect(trackerStatus('execution.market-making')).toBe('done');
  });
});
