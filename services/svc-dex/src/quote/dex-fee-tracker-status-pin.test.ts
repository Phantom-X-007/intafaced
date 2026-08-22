import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEX_FEE_HONEST_GAPS,
  DEX_FEE_SOURCE_TRACKER_ID,
  dexFeeOwnerEnvComposeGapsClosed,
  dexFeeSourceMountVsTrackerBoardCard,
  dexFeeSourceTrackerBackendDoneBarMet,
} from './dex-fee-mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('socket.dex-fee-source tracker status pin', () => {
  it('CLOB fee compose gaps closed; internal-book + eth_call residuals remain', () => {
    expect(dexFeeOwnerEnvComposeGapsClosed()).toBe(true);
    expect(DEX_FEE_HONEST_GAPS).toEqual(['gap.internal_book_fee_not_sourced', 'gap.clob_projection_not_eth_call']);
    expect(dexFeeSourceTrackerBackendDoneBarMet()).toBe(true);
    expect(dexFeeSourceMountVsTrackerBoardCard().gaps).toBe(2);
  });

  it('features.mjs marks socket.dex-fee-source done when owner env wiring ships', () => {
    expect(DEX_FEE_SOURCE_TRACKER_ID).toBe('socket.dex-fee-source');
    expect(trackerStatus('socket.dex-fee-source')).toBe('done');
  });
});
