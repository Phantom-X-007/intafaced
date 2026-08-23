import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ALERTS_HONEST_GAPS,
  ALERTS_TRACKER_ID,
  alertsMountVsTrackerBoardCard,
  alertsTrackerBackendDoneBarMet,
} from './alerts-mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('v22.alerts tracker status pin', () => {
  it('sourced-mark watches shipped; whale/intelligence/mobile/gateway gaps remain', () => {
    expect(alertsTrackerBackendDoneBarMet()).toBe(true);
    expect(ALERTS_HONEST_GAPS).toEqual(['gap.whale_intelligence_kinds', 'gap.mobile_sync', 'gap.out_of_app_gateway_credentials']);
    expect(alertsMountVsTrackerBoardCard().gaps).toBe(3);
  });

  it('features.mjs marks v22.alerts done when backend done bar met', () => {
    expect(ALERTS_TRACKER_ID).toBe('v22.alerts');
    expect(trackerStatus('v22.alerts')).toBe('done');
  });
});
