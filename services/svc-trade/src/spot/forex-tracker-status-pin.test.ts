import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FOREX_HONEST_GAPS,
  FOREX_TRACKER_ID,
  forexMountVsTrackerBoardCard,
  forexOwnerEnvComposeGapsClosed,
  forexTrackerBackendDoneBarMet,
} from './forex-mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('trade.forex tracker status pin', () => {
  it('P0-05 compose gap closed; fiat settle rails residual remains', () => {
    expect(forexOwnerEnvComposeGapsClosed()).toBe(true);
    expect(FOREX_HONEST_GAPS).toEqual(['gap.fiat_settle_rails']);
    expect(forexTrackerBackendDoneBarMet()).toBe(true);
    expect(forexMountVsTrackerBoardCard().gaps).toBe(1);
  });

  it('features.mjs marks trade.forex done when owner env wiring ships', () => {
    expect(FOREX_TRACKER_ID).toBe('trade.forex');
    expect(trackerStatus('trade.forex')).toBe('done');
  });
});
