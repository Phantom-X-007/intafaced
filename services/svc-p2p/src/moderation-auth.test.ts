import { describe, expect, it } from 'vitest';
import { assertModerator, isModerationConfigured, isModerator, parseModeratorUserIds } from './moderation-auth.js';
import { P2pError } from './p2p-service.js';

const MOD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('parseModeratorUserIds', () => {
  it('treats empty / blank as unconfigured', () => {
    expect(parseModeratorUserIds(undefined)).toEqual([]);
    expect(parseModeratorUserIds('')).toEqual([]);
    expect(parseModeratorUserIds('  ,  ')).toEqual([]);
  });

  it('accepts comma and whitespace separated lowercase UUIDs', () => {
    expect(parseModeratorUserIds(`${MOD}, ${OTHER}`)).toEqual([MOD, OTHER]);
    expect(parseModeratorUserIds(`${MOD}\n${OTHER}`)).toEqual([MOD, OTHER]);
  });

  it('dedupes and lowercases', () => {
    expect(parseModeratorUserIds(`${MOD.toUpperCase()},${MOD}`)).toEqual([MOD]);
  });

  it('refuses a non-UUID so a typo cannot silently empty the allowlist', () => {
    expect(() => parseModeratorUserIds('not-a-uuid')).toThrow(/canonical UUID/);
  });
});

describe('moderator gate', () => {
  it('is unconfigured until at least one id is named', () => {
    expect(isModerationConfigured([])).toBe(false);
    expect(isModerationConfigured([MOD])).toBe(true);
  });

  it('recognises admin:compliance without an allowlist entry', () => {
    expect(isModerator({ userId: OTHER, scopes: ['p2p:read', 'admin:compliance'] }, [])).toBe(true);
  });

  it('recognises an allowlisted natural person with ordinary p2p:read', () => {
    expect(isModerator({ userId: MOD, scopes: ['p2p:read'] }, [MOD])).toBe(true);
    expect(isModerator({ userId: OTHER, scopes: ['p2p:read'] }, [MOD])).toBe(false);
  });

  it('never recognises an API key as the human required to rule on a dispute', () => {
    expect(isModerator({ userId: MOD, scopes: ['p2p:read'], kid: 'merchant-key-1' }, [MOD])).toBe(false);
    expect(isModerator({ userId: OTHER, scopes: ['admin:compliance'], kid: 'operator-key-1' }, [])).toBe(false);
  });

  it('refuses an API key before any dispute resolution can run', () => {
    expect(() => assertModerator({ userId: MOD, scopes: ['p2p:read'], kid: 'merchant-key-1' }, [MOD])).toThrow(P2pError);
    try {
      assertModerator({ userId: MOD, scopes: ['p2p:read'], kid: 'merchant-key-1' }, [MOD]);
    } catch (err) {
      expect(err).toMatchObject({ code: 'p2p.not_a_moderator' });
    }
  });

  it('honest-refuses when nothing is configured', () => {
    expect(() => assertModerator({ userId: OTHER, scopes: ['p2p:read'] }, [])).toThrow(P2pError);
    try {
      assertModerator({ userId: OTHER, scopes: ['p2p:read'] }, []);
    } catch (err) {
      expect(err).toMatchObject({ code: 'p2p.moderation_unreachable' });
    }
  });

  it('forbids a configured deployment to a non-moderator', () => {
    try {
      assertModerator({ userId: OTHER, scopes: ['p2p:read'] }, [MOD]);
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({ code: 'p2p.not_a_moderator' });
    }
  });
});
