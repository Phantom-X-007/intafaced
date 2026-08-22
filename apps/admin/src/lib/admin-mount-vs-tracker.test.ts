import { describe, expect, it } from 'vitest';
import {
  ADMIN_CONSOLE_PAGES,
  OPS_ADMIN_TRACKER_ID,
  adminConsolePagesPresent,
  opsAdminMountVsTrackerBoardCard,
  opsAdminTrackerBackendDoneBarMet,
} from './admin-mount-vs-tracker.js';

describe('ops.admin mount vs tracker honest gaps', () => {
  it('backend done bar met on tip — console pages + operator BFF routes wired', () => {
    expect(OPS_ADMIN_TRACKER_ID).toBe('ops.admin');
    expect(adminConsolePagesPresent().length).toBe(ADMIN_CONSOLE_PAGES.length);
    expect(opsAdminTrackerBackendDoneBarMet()).toBe(true);
    expect(opsAdminMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
