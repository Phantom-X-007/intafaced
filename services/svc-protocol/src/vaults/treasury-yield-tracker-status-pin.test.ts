import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TREASURY_YIELD_HONEST_GAPS,
  TREASURY_YIELD_TRACKER_ID,
  launchTreasuryYieldMountVsTrackerBoardCard,
  launchTreasuryYieldTrackerBackendDoneBarMet,
} from './treasury-yield-mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('launch.treasury-yield tracker status pin', () => {
  it('vault contract + honesty done bar met; licence content Class X residual', () => {
    expect(launchTreasuryYieldTrackerBackendDoneBarMet()).toBe(true);
    expect(TREASURY_YIELD_HONEST_GAPS).toEqual(['gap.licence_content_class_x', 'gap.contract_unaudited']);
    expect(launchTreasuryYieldMountVsTrackerBoardCard().gaps).toBe(2);
  });

  it('features.mjs marks launch.treasury-yield done when backend done bar met', () => {
    expect(TREASURY_YIELD_TRACKER_ID).toBe('launch.treasury-yield');
    expect(trackerStatus('launch.treasury-yield')).toBe('done');
  });
});
