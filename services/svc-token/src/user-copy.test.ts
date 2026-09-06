import { describe, expect, it } from 'vitest';
import { userCopy } from './user-copy.js';

/**
 * Unit card — user-visible token copy resolves @intafaced/i18n keys
 * 1. Promise: TRK-infra.i18n slice — stake / mint / distribute refuse strings
 * 2. Break: unknown key invents English instead of echoing the dotted name
 * 3. Done bar: known key renders catalog copy; unknown key === key string
 * 4. Class N
 * 5. Paths: services/svc-token + packages/i18n consumer pin (do not edit catalog)
 * 6. RED: unknown key becomes a sentence
 * 7. Collision: none vs svc-identity / packages/i18n catalog
 */
describe('userCopy — catalog keys, never invented English', () => {
  it('resolves a known catalog key from @intafaced/i18n', () => {
    expect(userCopy('error.notFound')).toBe('We could not find that.');
    expect(userCopy('token.stake_not_found')).toBe('We could not find that.');
    expect(userCopy('token.proposal_not_found')).toBe('We could not find that.');
    expect(userCopy('token.proposal_not_allowed')).toBe('You do not have access to this.');
    expect(userCopy('ledger.insufficient_funds')).toBe('Insufficient balance.');
    expect(userCopy('error.generic')).toBe('Something went wrong. Try again.');
  });

  it('renders the dotted key when the key is not in the catalog', () => {
    const missing = 'token.stake.this.key.does.not.exist';
    const rendered = userCopy(missing);

    expect(rendered).toBe(missing);
    expect(rendered).not.toMatch(/ /);
    expect(rendered).not.toMatch(/please try|something went wrong|could not find|insufficient/i);
  });

  it('does not invent emission or supply copy for unkeyed mint/distribute codes', () => {
    const exhausted = userCopy('token.supply_exhausted');
    expect(exhausted).toBe('token.supply_exhausted');
    expect(exhausted).not.toMatch(/ /);
    expect(exhausted).not.toMatch(/\d/);
    expect(exhausted).not.toMatch(/136000|max supply|epoch reward|halving/i);

    const distribute = userCopy('token.nothing_to_distribute');
    expect(distribute).toBe('token.nothing_to_distribute');
    expect(distribute).not.toMatch(/ /);
    expect(distribute).not.toMatch(/no revenue|yield|bps/i);

    const quorum = userCopy('token.governance_quorum_unset');
    expect(quorum).toBe('token.governance_quorum_unset');
    expect(quorum).not.toMatch(/ /);
    const unwired = userCopy('token.governance_execute_unwired');
    expect(unwired).toBe('token.governance_execute_unwired');
    const listLimit = userCopy('token.proposal_list_limit_unset');
    expect(listLimit).toBe('token.proposal_list_limit_unset');
    expect(listLimit).not.toMatch(/ /);
    expect(listLimit).not.toMatch(/50/);
    const stakesLimit = userCopy('token.stakes_list_limit_unset');
    expect(stakesLimit).toBe('token.stakes_list_limit_unset');
    expect(stakesLimit).not.toMatch(/ /);
    expect(stakesLimit).not.toMatch(/50/);
  });
});
