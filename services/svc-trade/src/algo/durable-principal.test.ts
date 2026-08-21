import { describe, expect, it } from 'vitest';
import type { Principal } from '@intafaced/auth';
import { TradeError } from '../spot/types.js';
import { captureAlgoPlaceGrant, parseAlgoPlaceGrant, principalFromAlgoGrant } from './durable-principal.js';

const USER = '11111111-1111-4111-8111-111111111111';
const SID = '33333333-3333-4333-8333-333333333333';

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    sub: USER,
    userId: USER,
    sid: SID,
    scopes: ['trade:read', 'trade:write'],
    tier: 'basic',
    mfa: false,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

describe('durable algo place grant', () => {
  it('reconstructs the presented scopes after a process restart (no JWT)', () => {
    const grant = captureAlgoPlaceGrant(principal());
    const restored = principalFromAlgoGrant({
      userId: USER,
      grant,
      expiresAt: new Date(Date.now() + 60_000),
      now: new Date(),
    });
    expect(restored.userId).toBe(USER);
    expect(restored.scopes).toEqual(['trade:read', 'trade:write']);
    expect(restored.sid).toBe(SID);
  });

  it('refuses to mint from a grant that lost trade:write', () => {
    expect(() =>
      principalFromAlgoGrant({
        userId: USER,
        grant: { scopes: ['trade:read'], sid: SID, tier: 'basic', mfa: false },
        expiresAt: new Date(Date.now() + 60_000),
        now: new Date(),
      }),
    ).toThrow(TradeError);
  });

  it('refuses after the schedule end (grant must not outlive the algo)', () => {
    const grant = captureAlgoPlaceGrant(principal());
    const ends = new Date('2020-01-01T00:00:00.000Z');
    expect(() =>
      principalFromAlgoGrant({
        userId: USER,
        grant,
        expiresAt: ends,
        now: new Date('2020-01-01T00:00:01.000Z'),
      }),
    ).toThrow(/expired with the schedule/);
  });

  it('parseAlgoPlaceGrant ignores junk and pre-migration null', () => {
    expect(parseAlgoPlaceGrant(null)).toBeNull();
    expect(parseAlgoPlaceGrant({ scopes: ['trade:read'], sid: SID, tier: 'basic', mfa: false })).toBeNull();
    expect(parseAlgoPlaceGrant(captureAlgoPlaceGrant(principal()))?.sid).toBe(SID);
  });

  it('capture refuses a caller without trade:write', () => {
    expect(() => captureAlgoPlaceGrant(principal({ scopes: ['trade:read'] }))).toThrow(
      /algo create cannot persist a place grant without trade:write/,
    );
  });
});
