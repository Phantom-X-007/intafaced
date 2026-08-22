import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  HOUSE_TENANT_HONEST_GAPS,
  HOUSE_TENANT_TRACKER_ID,
  houseTenantMountVsTrackerBoardCard,
  houseTenantTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('execution.house-tenant tracker status pin', () => {
  it('external-only mechanism shipped; internal half + disclosure gaps remain', () => {
    expect(houseTenantTrackerBackendDoneBarMet()).toBe(true);
    expect(HOUSE_TENANT_HONEST_GAPS).toEqual(['gap.internal_venue_half', 'gap.existence_disclosure_deferred']);
    expect(houseTenantMountVsTrackerBoardCard().gaps).toBe(2);
  });

  it('features.mjs marks execution.house-tenant done when mechanism ships', () => {
    expect(HOUSE_TENANT_TRACKER_ID).toBe('execution.house-tenant');
    expect(trackerStatus('execution.house-tenant')).toBe('done');
  });
});
