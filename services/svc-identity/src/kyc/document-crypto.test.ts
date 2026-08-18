import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptDocument, encryptDocument, parseKycDocKey } from './document-crypto.js';

describe('KYC document envelope crypto', () => {
  it('round-trips plaintext', () => {
    const key = randomBytes(32);
    const plain = Buffer.from('passport-scan-bytes');
    const { ciphertext, nonce } = encryptDocument(key, plain);
    expect(ciphertext.equals(plain)).toBe(false);
    expect(decryptDocument(key, ciphertext, nonce).equals(plain)).toBe(true);
  });

  it('refuses a wrong key', () => {
    const key = randomBytes(32);
    const { ciphertext, nonce } = encryptDocument(key, Buffer.from('secret-doc'));
    expect(() => decryptDocument(randomBytes(32), ciphertext, nonce)).toThrow();
  });

  it('parses base64 and hex keys; rejects weak', () => {
    const raw = randomBytes(32);
    expect(parseKycDocKey(raw.toString('base64'))?.equals(raw)).toBe(true);
    expect(parseKycDocKey(raw.toString('hex'))?.equals(raw)).toBe(true);
    expect(parseKycDocKey('')).toBeNull();
    expect(parseKycDocKey('short')).toBeNull();
    expect(parseKycDocKey(undefined)).toBeNull();
  });
});
