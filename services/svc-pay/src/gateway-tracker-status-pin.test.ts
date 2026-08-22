import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  GATEWAY_HONEST_GAPS,
  PAY_GATEWAY_TRACKER_ID,
  payGatewayMountVsTrackerBoardCard,
  payGatewayTrackerBackendDoneBarMet,
} from './gateway-mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('pay.gateway tracker status pin', () => {
  it('hosted checkout + merchant lifecycle shipped; card/KYB socket residuals remain', () => {
    expect(payGatewayTrackerBackendDoneBarMet()).toBe(true);
    expect(GATEWAY_HONEST_GAPS).toEqual(['gap.card_acquiring_absent_not_sandbox', 'gap.kyb_status_no_consumer', 'gap.socket_psp_partners']);
    expect(payGatewayMountVsTrackerBoardCard().gaps).toBe(3);
  });

  it('features.mjs marks pay.gateway done when backend done bar met', () => {
    expect(PAY_GATEWAY_TRACKER_ID).toBe('pay.gateway');
    expect(trackerStatus('pay.gateway')).toBe('done');
  });
});
