import { describe, expect, it } from 'vitest';
import {
  executionComposeBlock,
  venueOmsWireSvcExecutionComposeWired,
  venueOperatorCredentialEnvLiveComposeWired,
} from './aggregation-compose-wiring.js';

describe('venue.aggregation fleet compose OMS wire', () => {
  it('svc-execution declares EXECUTION_VENUE_IDS for OMS venue trade adapters', () => {
    expect(venueOmsWireSvcExecutionComposeWired()).toBe(true);
    expect(executionComposeBlock()).toMatch(/TRADE_URL:/);
  });

  it('svc-execution passes venue operator credential env through for live fleet', () => {
    expect(venueOperatorCredentialEnvLiveComposeWired()).toBe(true);
  });
});
