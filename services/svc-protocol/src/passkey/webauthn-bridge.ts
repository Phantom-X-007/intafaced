/**
 * Helpers that bridge svc-identity WebAuthn assertions to PasskeyOwner calldata.
 *
 * The signing path is intentionally the same as `webauthn.test.ts`:
 *   ieee-p1363 P-256 over sha256( authenticatorData || sha256(clientDataJSON) )
 */
import { createHash, createPrivateKey, generateKeyPairSync, sign as cryptoSign, type KeyObject } from 'node:crypto';
import { encodeAbiParameters, type Hex, toHex } from 'viem';

/** secp256r1 n/2 — matches P256.HALF_N in contracts/passkey/P256.sol. */
const P256_HALF_N = BigInt('0x7FFFFFFF800000007FFFFFFFFFFFFFFFDE737D56D38BCF4279DCAE9C032B1A29');
const P256_N = BigInt('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');

export function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

export function makeP256KeyPair(): {
  privateKey: KeyObject;
  qx: Hex;
  qy: Hex;
  jwk: { x: string; y: string };
} {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const privateJwk = privateKey.export({ format: 'jwk' });
  return {
    privateKey: createPrivateKey({ key: privateJwk, format: 'jwk' }),
    qx: `0x${Buffer.from(jwk.x!, 'base64url').toString('hex')}` as Hex,
    qy: `0x${Buffer.from(jwk.y!, 'base64url').toString('hex')}` as Hex,
    jwk: { x: jwk.x!, y: jwk.y! },
  };
}

/** Unpadded base64url of 32 bytes — must match PasskeyOwner.base64UrlEncode32. */
export function base64UrlEncode32(hash: Hex | Buffer): string {
  const buf = typeof hash === 'string' ? Buffer.from(hash.slice(2), 'hex') : hash;
  if (buf.length !== 32) throw new Error(`expected 32 bytes, got ${buf.length}`);
  return buf.toString('base64url');
}

export function buildGetClientDataJSON(opts: { challengeHash: Hex; origin: string }): Buffer {
  return Buffer.from(
    JSON.stringify({
      type: 'webauthn.get',
      challenge: base64UrlEncode32(opts.challengeHash),
      origin: opts.origin,
      crossOrigin: false,
    }),
    'utf8',
  );
}

export function buildAuthData(opts: { rpID: string; counter?: number }): Buffer {
  const rpHash = createHash('sha256').update(opts.rpID).digest();
  const header = Buffer.alloc(37);
  rpHash.copy(header, 0);
  header[32] = 0x05; // UP | UV
  header.writeUInt32BE(opts.counter ?? 1, 33);
  return header;
}

function lowS(r: Buffer, s: Buffer): { r: Hex; s: Hex } {
  let sInt = BigInt(toHex(s));
  if (sInt > P256_HALF_N) sInt = P256_N - sInt;
  return { r: toHex(r, { size: 32 }), s: `0x${sInt.toString(16).padStart(64, '0')}` as Hex };
}

export function signWebAuthnAssertion(opts: { privateKey: KeyObject; authenticatorData: Buffer; clientDataJSON: Buffer }): {
  r: Hex;
  s: Hex;
  messageHash: Hex;
} {
  const clientDataHash = createHash('sha256').update(opts.clientDataJSON).digest();
  const signed = Buffer.concat([opts.authenticatorData, clientDataHash]);
  const messageHash = createHash('sha256').update(signed).digest();
  const sig = cryptoSign('SHA256', signed, { key: opts.privateKey, dsaEncoding: 'ieee-p1363' });
  if (sig.length !== 64) throw new Error(`expected 64-byte ieee-p1363 sig, got ${sig.length}`);
  const { r, s } = lowS(sig.subarray(0, 32), sig.subarray(32, 64));
  return { r, s, messageHash: toHex(messageHash) };
}

/** abi.encode(authenticatorData, clientDataJSON, r, s) for PasskeyOwner.isValidSignature. */
export function encodePasskeySignature(opts: { authenticatorData: Buffer; clientDataJSON: Buffer; r: Hex; s: Hex }): Hex {
  return encodeAbiParameters(
    [{ type: 'bytes' }, { type: 'bytes' }, { type: 'bytes32' }, { type: 'bytes32' }],
    [toHex(opts.authenticatorData), toHex(opts.clientDataJSON), opts.r, opts.s],
  );
}
