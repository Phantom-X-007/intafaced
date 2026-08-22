import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  COPY_HONEST_GAPS,
  COPY_TRACKER_ID,
  copyMountVsTrackerBoardCard,
  copyOwnerLawComposeGapsClosed,
  copyTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('trade.copy tracker status pin', () => {
  it('fee-share + jurisdiction compose gaps closed; socket residuals remain honest', () => {
    expect(copyOwnerLawComposeGapsClosed()).toBe(true);
    expect(COPY_HONEST_GAPS).toEqual(['gap.auto_mirror_place_socket', 'gap.no_returns_ranked_board']);
    expect(copyTrackerBackendDoneBarMet()).toBe(true);
    expect(copyMountVsTrackerBoardCard().gaps).toBe(2);
  });

  it('features.mjs marks trade.copy done when owner-law wiring ships', () => {
    expect(COPY_TRACKER_ID).toBe('trade.copy');
    expect(trackerStatus('trade.copy')).toBe('done');
  });
});
