import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OTC_HONEST_GAPS,
  OTC_TRACKER_ID,
  otcDeskLawComposeGapsClosed,
  otcMountVsTrackerBoardCard,
  otcTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('trade.otc tracker status pin', () => {
  it('desk-law compose gap closed; socket residuals remain honest', () => {
    expect(otcDeskLawComposeGapsClosed()).toBe(true);
    expect(OTC_HONEST_GAPS).toEqual(['gap.socket_otc_maker_routing', 'gap.connect_venue_vault_custody']);
    expect(otcTrackerBackendDoneBarMet()).toBe(true);
    expect(otcMountVsTrackerBoardCard().gaps).toBe(2);
  });

  it('features.mjs marks trade.otc done when desk-law wiring ships', () => {
    expect(OTC_TRACKER_ID).toBe('trade.otc');
    expect(trackerStatus('trade.otc')).toBe('done');
  });
});
