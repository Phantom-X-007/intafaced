import { describe, expect, it } from 'vitest';
import {
  TERMINAL_PRODUCT_PATHS,
  WEB_TERMINAL_TRACKER_ID,
  terminalProductPathsPresent,
  webTerminalMountVsTrackerBoardCard,
  webTerminalTrackerBackendDoneBarMet,
} from './terminal-mount-vs-tracker.js';

describe('web.terminal mount vs tracker honest gaps (D26-P4-C1)', () => {
  it('backend done bar met on tip — vendored desk + depth feed wired', () => {
    expect(WEB_TERMINAL_TRACKER_ID).toBe('web.terminal');
    expect(terminalProductPathsPresent().length).toBe(TERMINAL_PRODUCT_PATHS.length);
    expect(webTerminalTrackerBackendDoneBarMet()).toBe(true);
    expect(webTerminalMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
