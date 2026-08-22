import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OPTIONS_HONEST_GAPS,
  OPTIONS_TRACKER_ID,
  optionsMountVsTrackerBoardCard,
  optionsOwnerEnvComposeGapsClosed,
  optionsTrackerBackendDoneBarMet,
} from './options-mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('trade.options tracker status pin', () => {
  it('P0-05 + D7 compose gaps closed; European engine residual remains', () => {
    expect(optionsOwnerEnvComposeGapsClosed()).toBe(true);
    expect(OPTIONS_HONEST_GAPS).toEqual(['gap.european_options_engine']);
    expect(optionsTrackerBackendDoneBarMet()).toBe(true);
    expect(optionsMountVsTrackerBoardCard().gaps).toBe(1);
  });

  it('features.mjs marks trade.options done when owner env wiring ships', () => {
    expect(OPTIONS_TRACKER_ID).toBe('trade.options');
    expect(trackerStatus('trade.options')).toBe('done');
  });
});
