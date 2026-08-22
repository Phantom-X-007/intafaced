import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXECUTION_SOR_HONEST_GAPS,
  executionSorMountVsTrackerBoardCard,
  executionSorTrackerBackendDoneBarMet,
} from './mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('execution.sor tracker status pin', () => {
  it('honest gaps are closed and backend done bar is met', () => {
    expect(EXECUTION_SOR_HONEST_GAPS).toEqual([]);
    expect(executionSorTrackerBackendDoneBarMet()).toBe(true);
    expect(executionSorMountVsTrackerBoardCard().gaps).toBe(0);
  });

  it('features.mjs marks execution.sor done when product gaps are closed', () => {
    expect(trackerStatus('execution.sor')).toBe('done');
  });
});
