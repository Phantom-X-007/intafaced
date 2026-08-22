import { describe, expect, it } from 'vitest';
import {
  executionComposeBlock,
  executionEmsStoreComposeWired,
  executionLetterBpsScheduleComposeWired,
  executionVenueOperatorCredComposeWired,
} from './execution-compose-wiring.js';
import { executionSorComposeGapsClosed } from './mount-vs-tracker.js';

describe('execution.sor fleet compose wiring', () => {
  it('svc-execution block declares durable EMS journal path + volume', () => {
    expect(executionEmsStoreComposeWired()).toBe(true);
    expect(executionComposeBlock()).toMatch(/execution-ems-journal:\/data\/execution/);
  });

  it('svc-execution passes venue.aggregation operator credential env through', () => {
    expect(executionVenueOperatorCredComposeWired()).toBe(true);
  });

  it('svc-execution passes letter→bps owner schedule env through', () => {
    expect(executionLetterBpsScheduleComposeWired()).toBe(true);
  });

  it('closes durable_ems_store, live_venue_cred_operator_wiring, and letter_to_bps_owner_schedule compose gaps', () => {
    expect(executionSorComposeGapsClosed()).toBe(true);
  });
});
