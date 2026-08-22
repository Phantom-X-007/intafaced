import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  TERMINAL_HONEST_GAPS,
  WEB_TERMINAL_TRACKER_ID,
  webTerminalMountVsTrackerBoardCard,
  webTerminalTrackerBackendDoneBarMet,
} from './terminal-mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('web.terminal tracker status pin', () => {
  it('vendored desk + depth feed wired; L11 craft gaps remain honest', () => {
    expect(webTerminalTrackerBackendDoneBarMet()).toBe(true);
    expect(TERMINAL_HONEST_GAPS).toEqual([
      'gap.brand_drain_l11',
      'gap.depth_number_refuse_l11',
      'gap.snapshot_provenance_l11',
    ]);
    expect(webTerminalMountVsTrackerBoardCard().gaps).toBe(3);
  });

  it('features.mjs marks web.terminal done when backend done bar met', () => {
    expect(WEB_TERMINAL_TRACKER_ID).toBe('web.terminal');
    expect(trackerStatus('web.terminal')).toBe('done');
  });
});
