import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  QUANT_STUDIO_HONEST_GAPS,
  QUANT_STUDIO_TRACKER_ID,
  quantStudioMountVsTrackerBoardCard,
  quantStudioTrackerBackendDoneBarMet,
} from './quant-studio-mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('quant.studio tracker status pin', () => {
  it('contract boundary + visual builder shipped; sandbox escape remains an honest gap', () => {
    expect(quantStudioTrackerBackendDoneBarMet()).toBe(true);
    expect(QUANT_STUDIO_HONEST_GAPS).toHaveLength(1);
    expect(quantStudioMountVsTrackerBoardCard().gaps).toBe(1);
  });

  it('features.mjs marks quant.studio done when contract + data-lake dep ship', () => {
    expect(QUANT_STUDIO_TRACKER_ID).toBe('quant.studio');
    expect(trackerStatus('quant.studio')).toBe('done');
  });
});
