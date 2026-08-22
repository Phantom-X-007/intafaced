import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FUTURES_HONEST_GAPS,
  FUTURES_TRACKER_ID,
  futuresMountVsTrackerBoardCard,
  futuresOwnerEnvComposeGapsClosed,
  futuresTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('trade.futures tracker status pin', () => {
  it('owner ladder/funding/leverage compose gaps closed; re-leverage socket residual remains', () => {
    expect(futuresOwnerEnvComposeGapsClosed()).toBe(true);
    expect(FUTURES_HONEST_GAPS).toEqual(['gap.live_releverage_501']);
    expect(futuresTrackerBackendDoneBarMet()).toBe(true);
    expect(futuresMountVsTrackerBoardCard().gaps).toBe(1);
  });

  it('features.mjs marks trade.futures done when owner env wiring ships', () => {
    expect(FUTURES_TRACKER_ID).toBe('trade.futures');
    expect(trackerStatus('trade.futures')).toBe('done');
  });
});
