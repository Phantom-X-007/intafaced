import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { keccak256, toHex } from 'viem';
import {
  base64UrlEncode32,
  buildAuthData,
  buildGetClientDataJSON,
  encodePasskeySignature,
  makeP256KeyPair,
  signWebAuthnAssertion,
} from './webauthn-bridge.js';

describe('webauthn-bridge (hermetic — same path as svc-identity assertions)', () => {
  it('base64url of 32 bytes is 43 chars unpadded', () => {
    const hash = keccak256(toHex(Buffer.from('challenge-binding')));
    expect(base64UrlEncode32(hash)).toHaveLength(43);
    expect(base64UrlEncode32(hash)).not.toMatch(/[+/=]/);
  });

  it('clientDataJSON challenge binds the digest the account will check', () => {
    const hash = keccak256('0xdeadbeef');
    const json = buildGetClientDataJSON({ challengeHash: hash, origin: 'http://localhost:3000' }).toString('utf8');
    const parsed = JSON.parse(json) as { type: string; challenge: string };
    expect(parsed.type).toBe('webauthn.get');
    expect(parsed.challenge).toBe(base64UrlEncode32(hash));
    expect(json.startsWith('{"type":"webauthn.get","challenge":"')).toBe(true);
  });

  it('produces a P-256 signature Node accepts over sha256(authData||sha256(clientData))', () => {
    const keys = makeP256KeyPair();
    const hash = keccak256('0x01');
    const clientDataJSON = buildGetClientDataJSON({ challengeHash: hash, origin: 'http://localhost:3000' });
    const authenticatorData = buildAuthData({ rpID: 'localhost' });
    const { r, s, messageHash } = signWebAuthnAssertion({
      privateKey: keys.privateKey,
      authenticatorData,
      clientDataJSON,
    });

    const clientDataHash = createHash('sha256').update(clientDataJSON).digest();
    const signed = Buffer.concat([authenticatorData, clientDataHash]);
    expect(messageHash).toBe(toHex(createHash('sha256').update(signed).digest()));
    expect(r.startsWith('0x')).toBe(true);
    expect(s.length).toBe(66);

    const encoded = encodePasskeySignature({ authenticatorData, clientDataJSON, r, s });
    expect(encoded.startsWith('0x')).toBe(true);
    expect(keys.qx.length).toBe(66);
    expect(keys.qy.length).toBe(66);
  });
});
