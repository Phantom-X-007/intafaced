import { describe, expect, it } from 'vitest';
import {
  CERT_MOUNTED_DOORS,
  CERTS_TRACKER_ID,
  academyCertsMountVsTrackerBoardCard,
  academyCertsTrackerBackendDoneBarMet,
  certDoorsInRouterSource,
} from './mount-vs-tracker.js';

describe('academy.certs mount vs tracker honest gaps (D26-P1-C1)', () => {
  it('backend done bar met on tip — cert perk plane refuse-closed', () => {
    expect(CERTS_TRACKER_ID).toBe('academy.certs');
    expect(certDoorsInRouterSource()).toEqual([...CERT_MOUNTED_DOORS]);
    expect(academyCertsTrackerBackendDoneBarMet()).toBe(true);
    expect(academyCertsMountVsTrackerBoardCard().backendDoneBarMet).toBe(true);
  });
});
