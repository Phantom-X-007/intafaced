import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const NONCE_LEN = 12;
const TAG_LEN = 16;

/**
 * Decode a 32-byte AES key from env (base64 or 64-char hex).
 * Missing/invalid → null (store refuses put; no improvised key).
 */
export function parseKycDocKey(raw: string | undefined | null): Buffer | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      const buf = Buffer.from(trimmed, 'hex');
      return buf.length === 32 ? buf : null;
    }
    const buf = Buffer.from(trimmed, 'base64');
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

export function encryptDocument(key: Buffer, plaintext: Buffer): { ciphertext: Buffer; nonce: Buffer } {
  if (key.length !== 32) throw new Error('KYC doc key must be 32 bytes');
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALGO, key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([encrypted, tag]), nonce };
}

export function decryptDocument(key: Buffer, ciphertext: Buffer, nonce: Buffer): Buffer {
  if (key.length !== 32) throw new Error('KYC doc key must be 32 bytes');
  if (ciphertext.length < TAG_LEN) throw new Error('ciphertext too short');
  if (nonce.length !== NONCE_LEN) throw new Error('nonce length');
  const data = ciphertext.subarray(0, ciphertext.length - TAG_LEN);
  const tag = ciphertext.subarray(ciphertext.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

export function safeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
