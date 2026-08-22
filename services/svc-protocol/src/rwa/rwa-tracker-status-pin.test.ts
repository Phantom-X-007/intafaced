import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  RWA_HONEST_GAPS,
  RWA_TRACKER_ID,
  launchRwaMountVsTrackerBoardCard,
  launchRwaTrackerBackendDoneBarMet,
} from './rwa-mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('launch.rwa tracker status pin', () => {
  it('registry contract + honesty + forge done bar met; licence content Class X residual', () => {
    expect(launchRwaTrackerBackendDoneBarMet()).toBe(true);
    expect(RWA_HONEST_GAPS).toEqual(['gap.licence_content_class_x', 'gap.contract_unaudited']);
    expect(launchRwaMountVsTrackerBoardCard().gaps).toBe(2);
  });

  it('features.mjs marks launch.rwa done when backend done bar met', () => {
    expect(RWA_TRACKER_ID).toBe('launch.rwa');
    expect(trackerStatus('launch.rwa')).toBe('done');
  });
});
