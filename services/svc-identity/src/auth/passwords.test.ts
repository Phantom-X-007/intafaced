import { describe, expect, it } from 'vitest';
import {
  WeakPasswordError,
  algorithmOf,
  argon2Available,
  assertPasswordShape,
  generateApiKey,
  generateToken,
  hashPassword,
  hashToken,
  needsRehash,
  verifyPassword,
} from './passwords.js';

describe('password hashing', () => {
  it('produces a verifiable hash', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(hash, 'correct horse battery staple')).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword(hash, 'Correct horse battery staple')).toBe(false);
    expect(await verifyPassword(hash, '')).toBe(false);
  });

  it('salts — the same password never produces the same hash twice', async () => {
    const a = await hashPassword('correct horse battery staple');
    const b = await hashPassword('correct horse battery staple');
    expect(a).not.toBe(b);
    expect(await verifyPassword(b, 'correct horse battery staple')).toBe(true);
  });

  it('never falls back to a fast hash', async () => {
    const algorithm = algorithmOf(await hashPassword('correct horse battery staple'));
    expect(['argon2id', 'scrypt']).toContain(algorithm);
    // Whichever path was taken, it must be memory-hard.
    expect(algorithm).not.toBe('unknown');
  });

  it('uses argon2id when it is installed', async () => {
    const algorithm = algorithmOf(await hashPassword('correct horse battery staple'));
    expect(algorithm).toBe((await argon2Available()) ? 'argon2id' : 'scrypt');
  });

  it('verifies a scrypt hash even when argon2 is available, so nobody is locked out', async () => {
    // Simulates a user whose hash predates the argon2 rollout.
    // maxmem must be raised here for the same reason it is in the source:
    // 128·N·r at N=2^15, r=8 is exactly Node's 32 MiB default ceiling.
    const salt = Buffer.from('0123456789abcdef');
    const { scryptSync } = await import('node:crypto');
    const derived = scryptSync('legacy password here', salt, 64, { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 });
    const legacy = `$scrypt$N=32768,r=8,p=1$${salt.toString('base64')}$${derived.toString('base64')}`;

    expect(await verifyPassword(legacy, 'legacy password here')).toBe(true);
    expect(await verifyPassword(legacy, 'wrong')).toBe(false);
  });

  it('returns false for a corrupt stored hash instead of throwing', async () => {
    // A row we cannot evaluate is a failed login, never a 500 — and never a
    // timing signal for which accounts have unusable hashes.
    expect(await verifyPassword('$scrypt$N=99999999,r=8,p=1$AAAA$BBBB', 'anything')).toBe(false);
    expect(await verifyPassword('$scrypt$broken', 'anything')).toBe(false);
  });

  it('flags a legacy hash for upgrade only when the stronger algorithm is available', async () => {
    const legacy = '$scrypt$N=32768,r=8,p=1$AAAA$BBBB';
    expect(await needsRehash(legacy)).toBe(await argon2Available());
  });

  it('returns false for an unrecognised hash rather than throwing', async () => {
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
    expect(await verifyPassword('', 'anything')).toBe(false);
  });
});

describe('password policy — length over composition', () => {
  it('requires 12 characters', () => {
    expect(() => assertPasswordShape('short')).toThrow(WeakPasswordError);
    expect(() => assertPasswordShape('exactly12chr')).not.toThrow();
  });

  it('accepts a passphrase with no symbols or digits', () => {
    // Composition rules push people to "Password1!". NIST dropped them; so do we.
    expect(() => assertPasswordShape('correct horse battery staple')).not.toThrow();
  });

  it('rejects a single repeated character', () => {
    expect(() => assertPasswordShape('aaaaaaaaaaaaaaaa')).toThrow(WeakPasswordError);
  });

  it('rejects over 72 bytes, keeping a bcrypt migration open', () => {
    expect(() => assertPasswordShape('a'.repeat(73))).toThrow(/72 bytes/);
    // Multi-byte characters count as bytes, not characters.
    expect(() => assertPasswordShape('🔑'.repeat(19))).toThrow(/72 bytes/);
  });
});

describe('tokens', () => {
  it('hashes deterministically and irreversibly', () => {
    const token = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).not.toContain(token);
  });

  it('generates unique tokens', () => {
    expect(new Set(Array.from({ length: 200 }, () => generateToken())).size).toBe(200);
  });

  it('builds an API key whose prefix identifies it without revealing it', () => {
    const { key, hash, prefix } = generateApiKey();
    expect(key.startsWith('ifc_')).toBe(true);
    expect(prefix).toBe(key.slice(0, 12));
    expect(hash).toBe(hashToken(key));
    expect(key.length).toBeGreaterThan(prefix.length + 16);
  });
});
