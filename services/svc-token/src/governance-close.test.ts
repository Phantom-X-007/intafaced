import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GOVERNANCE_EXECUTE_UNWIRED,
  GOVERNANCE_QUORUM_BPS_ENV,
  GOVERNANCE_QUORUM_UNSET,
  GOVERNANCE_THRESHOLD_BPS_ENV,
  decideProposalOutcome,
  executeUnwiredFor,
  readGovernanceBps,
  readGovernanceParams,
} from './governance-close.js';

describe('readGovernanceBps — blank is unset, never 0-as-free', () => {
  it('missing / blank / whitespace → unset', () => {
    expect(readGovernanceBps(undefined)).toEqual({ present: false });
    expect(readGovernanceBps('')).toEqual({ present: false });
    expect(readGovernanceBps('   ')).toEqual({ present: false });
  });

  it('non-integer / out of range → unset (not invented)', () => {
    expect(readGovernanceBps('abc')).toEqual({ present: false });
    expect(readGovernanceBps('10.5')).toEqual({ present: false });
    expect(readGovernanceBps('-1')).toEqual({ present: false });
    expect(readGovernanceBps('10001')).toEqual({ present: false });
    expect(readGovernanceBps('+500')).toEqual({ present: false });
  });

  it('explicit 0 is owner-present', () => {
    expect(readGovernanceBps('0')).toEqual({ present: true, bps: 0 });
  });

  it('10000 is 100%', () => {
    expect(readGovernanceBps('10000')).toEqual({ present: true, bps: 10_000 });
  });

  it('readGovernanceParams requires both env names; one blank is unset', () => {
    expect(readGovernanceParams({})).toEqual({ quorumBps: undefined, thresholdBps: undefined });
    expect(
      readGovernanceParams({
        [GOVERNANCE_QUORUM_BPS_ENV]: '1000',
        [GOVERNANCE_THRESHOLD_BPS_ENV]: '',
      }),
    ).toEqual({ quorumBps: 1000, thresholdBps: undefined });
  });
});

describe('decideProposalOutcome — close writes passed|rejected', () => {
  const q10 = { quorumBps: 1000, thresholdBps: 5000 };

  it('writes passed when quorum and for-threshold both hold', () => {
    expect(
      decideProposalOutcome({
        forWeight: 600n,
        againstWeight: 400n,
        abstainWeight: 0n,
        eligibleStake: 1000n,
        ...q10,
      }),
    ).toBe('passed');
  });

  it('writes rejected when against wins the threshold', () => {
    expect(
      decideProposalOutcome({
        forWeight: 400n,
        againstWeight: 600n,
        abstainWeight: 0n,
        eligibleStake: 1000n,
        ...q10,
      }),
    ).toBe('rejected');
  });

  it('writes rejected when quorum fails even if every ballot is for', () => {
    expect(
      decideProposalOutcome({
        forWeight: 99n,
        againstWeight: 0n,
        abstainWeight: 0n,
        eligibleStake: 1000n,
        ...q10,
      }),
    ).toBe('rejected');
  });

  it('writes rejected when nobody voted for or against (abstain-only)', () => {
    expect(
      decideProposalOutcome({
        forWeight: 0n,
        againstWeight: 0n,
        abstainWeight: 1000n,
        eligibleStake: 1000n,
        ...q10,
      }),
    ).toBe('rejected');
  });

  it('writes rejected on an empty tally', () => {
    expect(
      decideProposalOutcome({
        forWeight: 0n,
        againstWeight: 0n,
        abstainWeight: 0n,
        eligibleStake: 1000n,
        ...q10,
      }),
    ).toBe('rejected');
  });

  it('owner 0% quorum still requires the for-threshold', () => {
    expect(
      decideProposalOutcome({
        forWeight: 1n,
        againstWeight: 0n,
        abstainWeight: 0n,
        eligibleStake: 10_000n,
        quorumBps: 0,
        thresholdBps: 5000,
      }),
    ).toBe('passed');
    expect(
      decideProposalOutcome({
        forWeight: 0n,
        againstWeight: 1n,
        abstainWeight: 0n,
        eligibleStake: 10_000n,
        quorumBps: 0,
        thresholdBps: 5000,
      }),
    ).toBe('rejected');
  });
});

describe('executeUnwiredFor — grant/listing do not move value', () => {
  it('names token.governance_execute_unwired for grant and listing', () => {
    expect(executeUnwiredFor('grant')).toBe(GOVERNANCE_EXECUTE_UNWIRED);
    expect(executeUnwiredFor('listing')).toBe(GOVERNANCE_EXECUTE_UNWIRED);
    expect(executeUnwiredFor('fee_param')).toBeNull();
    expect(executeUnwiredFor('curriculum')).toBeNull();
  });
});

describe('env.ts / compose — no invented quorum numbers', () => {
  const envTs = readFileSync(resolve(import.meta.dirname, './env.ts'), 'utf8');
  const compose = readFileSync(resolve(import.meta.dirname, '../../../docker-compose.apps.yml'), 'utf8');

  it('env.ts declares both BPS keys with no numeric default', () => {
    expect(envTs).toContain(GOVERNANCE_QUORUM_BPS_ENV);
    expect(envTs).toContain(GOVERNANCE_THRESHOLD_BPS_ENV);
    expect(envTs).toContain(GOVERNANCE_QUORUM_UNSET);
    const quorumSlice = envTs.slice(envTs.indexOf(GOVERNANCE_QUORUM_BPS_ENV), envTs.indexOf(GOVERNANCE_QUORUM_BPS_ENV) + 280);
    const thresholdSlice = envTs.slice(envTs.indexOf(GOVERNANCE_THRESHOLD_BPS_ENV), envTs.indexOf(GOVERNANCE_THRESHOLD_BPS_ENV) + 280);
    expect(quorumSlice).not.toMatch(/\.default\(\s*\d+/);
    expect(thresholdSlice).not.toMatch(/\.default\(\s*\d+/);
  });

  it('compose passes host values through with a blank default, never a number', () => {
    expect(compose).toMatch(/TOKEN_GOVERNANCE_QUORUM_BPS:\s*\$\{TOKEN_GOVERNANCE_QUORUM_BPS:-\}/);
    expect(compose).toMatch(/TOKEN_GOVERNANCE_THRESHOLD_BPS:\s*\$\{TOKEN_GOVERNANCE_THRESHOLD_BPS:-\}/);
    expect(compose).not.toMatch(/TOKEN_GOVERNANCE_QUORUM_BPS:\s*\$\{TOKEN_GOVERNANCE_QUORUM_BPS:-\d+\}/);
    expect(compose).not.toMatch(/TOKEN_GOVERNANCE_THRESHOLD_BPS:\s*\$\{TOKEN_GOVERNANCE_THRESHOLD_BPS:-\d+\}/);
  });
});
