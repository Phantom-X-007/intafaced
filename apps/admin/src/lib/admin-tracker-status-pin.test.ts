import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OPS_ADMIN_HONEST_GAPS,
  OPS_ADMIN_TRACKER_ID,
  opsAdminMountVsTrackerBoardCard,
  opsAdminTrackerBackendDoneBarMet,
} from './admin-mount-vs-tracker.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

function trackerStatus(featureId: string): string | null {
  const src = readFileSync(join(ROOT, 'tooling/tracker/features.mjs'), 'utf8');
  const match = src.match(new RegExp(`f\\('${featureId.replace('.', '\\.')}'[\\s\\S]*?status:\\s*'([^']+)'`));
  return match?.[1] ?? null;
}

describe('ops.admin tracker status pin', () => {
  it('operator console shipped; fee writes + SSO ACL gaps remain honest', () => {
    expect(opsAdminTrackerBackendDoneBarMet()).toBe(true);
    expect(OPS_ADMIN_HONEST_GAPS).toEqual(['gap.fee_listing_write_paths', 'gap.class_x_sso_acl']);
    expect(opsAdminMountVsTrackerBoardCard().gaps).toBe(2);
  });

  it('features.mjs marks ops.admin done when backend done bar met', () => {
    expect(OPS_ADMIN_TRACKER_ID).toBe('ops.admin');
    expect(trackerStatus('ops.admin')).toBe('done');
  });
});
