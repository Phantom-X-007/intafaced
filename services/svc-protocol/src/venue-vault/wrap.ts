/**
 * AES-256-GCM wrap for venue API material. The wrap key is a KEK, not a chain
 * signing key — svc-protocol still originates no user transaction (§16.10).
 *
 * Production KEK belongs in an HSM (Class X / Nitro). An empty KEK fail-closes.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class VenueVaultKekUnconfiguredError extends Error {
  readonly code = 'venue_vault.kek_unconfigured' as const;
  constructor() {
    super('venue vault KEK unconfigured — HSM wrap is Nitro/Class X residual');
    this.name = 'VenueVaultKekUnconfiguredError';
  }
}

const IV_LEN = 12;
const TAG_LEN = 16;
const KEK_LEN = 32;

export type WrappedSecret = {
  readonly iv: Buffer;
  readonly tag: Buffer;
  readonly ciphertext: Buffer;
};

export function parseKek(hex: string | undefined | null): Buffer {
  const raw = (hex ?? '').trim();
  if (!raw) throw new VenueVaultKekUnconfiguredError();
  const buf = Buffer.from(raw, 'hex');
  if (buf.length !== KEK_LEN) throw new VenueVaultKekUnconfiguredError();
  return buf;
}

export function wrapSecret(kek: Buffer, plaintext: Buffer): WrappedSecret {
  if (kek.length !== KEK_LEN) throw new VenueVaultKekUnconfiguredError();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', kek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), ciphertext };
}

export function unwrapSecret(kek: Buffer, wrapped: WrappedSecret): Buffer {
  if (kek.length !== KEK_LEN) throw new VenueVaultKekUnconfiguredError();
  if (wrapped.tag.length !== TAG_LEN) throw new Error('venue_vault.unwrap_failed');
  const decipher = createDecipheriv('aes-256-gcm', kek, wrapped.iv);
  decipher.setAuthTag(wrapped.tag);
  return Buffer.concat([decipher.update(wrapped.ciphertext), decipher.final()]);
}
