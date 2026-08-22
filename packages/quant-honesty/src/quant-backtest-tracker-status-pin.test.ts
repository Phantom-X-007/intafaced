import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  QUANT_BACKTEST_HONEST_GAPS,
  QUANT_BACKTEST_TRACKER_ID,
  quantBacktestMountVsTrackerBoardCard,
  quantBacktestTrackerBackendDoneBarMet,
} from './quant-backtest-mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('quant.backtest tracker status pin', () => {
  it('contract boundary shipped; engine + walk-forward gaps remain honest', () => {
    expect(quantBacktestTrackerBackendDoneBarMet()).toBe(true);
    expect(QUANT_BACKTEST_HONEST_GAPS).toHaveLength(2);
    expect(quantBacktestMountVsTrackerBoardCard().gaps).toBe(2);
  });

  it('features.mjs marks quant.backtest done when contract + deps ship', () => {
    expect(QUANT_BACKTEST_TRACKER_ID).toBe('quant.backtest');
    expect(trackerStatus('quant.backtest')).toBe('done');
  });
});
