import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PAY_PLUGINS_TRACKER_ID,
  PLUGINS_MOUNTED_DOORS,
  payPluginsMountVsTrackerBoardCard,
  payPluginsTrackerBackendDoneBarMet,
  pluginsDoorsInRouterSource,
} from './mount-vs-tracker.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('pay.plugins mount vs tracker honest gaps (D26-P1-P8)', () => {
  it('backend done bar met on tip — Woo adapter + reference path', () => {
    expect(PAY_PLUGINS_TRACKER_ID).toBe('pay.plugins');
    expect(pluginsDoorsInRouterSource()).toEqual([...PLUGINS_MOUNTED_DOORS]);
    expect(payPluginsTrackerBackendDoneBarMet(repoRoot)).toBe(true);
    expect(payPluginsMountVsTrackerBoardCard(repoRoot).backendDoneBarMet).toBe(true);
  });
});
