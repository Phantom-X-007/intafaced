import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign as cryptoSign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encodeCbor } from './cbor.js';
import {
  ChallengeStore,
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
  StoredWebAuthnCredential,
  b64urlDecode,
  b64urlEncode,
  buildAuthenticatorData,
  buildClientDataJSON,
  coseKeyFromJwk,
  createAuthenticationOptions,
  createRegistrationOptions,
  generateChallenge,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  WebAuthnError,
} from './webauthn.js';

const config = {
  rpID: 'localhost',
  rpName: 'INTAFACED',
  origin: 'http://localhost:3000',
};

function makeKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string; kty: string; crv: string };
  const privateJwk = privateKey.export({ format: 'jwk' });
  return {
    privateKey: createPrivateKey({ key: privateJwk, format: 'jwk' }),
    publicKey: createPublicKey({ key: jwk, format: 'jwk' }),
    jwk,
    cose: coseKeyFromJwk(jwk),
  };
}

function signAssertion(privateKey: ReturnType<typeof createPrivateKey>, authData: Buffer, clientDataJSON: Buffer): Buffer {
  const clientDataHash = createHash('sha256').update(clientDataJSON).digest();
  const signed = Buffer.concat([authData, clientDataHash]);
  return cryptoSign('SHA256', signed, { key: privateKey, dsaEncoding: 'ieee-p1363' });
}

function noneAttestation(authData: Buffer): Buffer {
  return Buffer.from(
    encodeCbor(
      new Map<unknown, unknown>([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', new Uint8Array(authData)],
      ]),
    ),
  );
}

describe('base64url', () => {
  it('round-trips', () => {
    const raw = Buffer.from([0, 1, 2, 250, 255]);
    expect(b64urlDecode(b64urlEncode(raw)).equals(raw)).toBe(true);
  });
});

describe('ChallengeStore', () => {
  it('returns a matching challenge once, then never again', () => {
    const store = new ChallengeStore(60_000);
    store.put('registration', 'chal-1', 'user-1');
    expect(store.take('chal-1', 'registration')).toMatchObject({ userId: 'user-1', kind: 'registration' });
    expect(store.take('chal-1', 'registration')).toBeNull();
  });

  it('refuses a challenge used for the wrong ceremony', () => {
    const store = new ChallengeStore(60_000);
    store.put('registration', 'chal-2', 'user-1');
    expect(store.take('chal-2', 'authentication')).toBeNull();
  });
});

describe('registration ceremony', () => {
  it('accepts a well-formed none-attestation credential and returns a stored shape', () => {
    const challenge = generateChallenge();
    const keys = makeKeyPair();
    const credId = randomBytes(16);

    const clientDataJSON = buildClientDataJSON({
      type: 'webauthn.create',
      challenge,
      origin: config.origin,
    });
    const authData = buildAuthenticatorData({
      rpID: config.rpID,
      counter: 0,
      credential: { id: credId, publicKeyCose: keys.cose },
    });

    const response: RegistrationResponseJSON = {
      id: b64urlEncode(credId),
      rawId: b64urlEncode(credId),
      type: 'public-key',
      response: {
        clientDataJSON: b64urlEncode(clientDataJSON),
        attestationObject: b64urlEncode(noneAttestation(authData)),
        transports: ['internal'],
      },
    };

    const stored = verifyRegistrationResponse(config, challenge, response);
    expect(stored.credentialId).toBe(b64urlEncode(credId));
    expect(stored.counter).toBe(0);
    expect(stored.transports).toEqual(['internal']);
    expect(stored.publicKey.length).toBeGreaterThan(16);
  });

  it('rejects a wrong challenge', () => {
    const keys = makeKeyPair();
    const credId = Buffer.alloc(16, 7);
    const clientDataJSON = buildClientDataJSON({
      type: 'webauthn.create',
      challenge: generateChallenge(),
      origin: config.origin,
    });
    const authData = buildAuthenticatorData({
      rpID: config.rpID,
      counter: 0,
      credential: { id: credId, publicKeyCose: keys.cose },
    });

    const response: RegistrationResponseJSON = {
      id: b64urlEncode(credId),
      rawId: b64urlEncode(credId),
      type: 'public-key',
      response: {
        clientDataJSON: b64urlEncode(clientDataJSON),
        attestationObject: b64urlEncode(noneAttestation(authData)),
      },
    };

    expect(() => verifyRegistrationResponse(config, generateChallenge(), response)).toThrow(WebAuthnError);
  });

  it('rejects a foreign origin', () => {
    const challenge = generateChallenge();
    const keys = makeKeyPair();
    const credId = Buffer.alloc(16, 3);
    const clientDataJSON = buildClientDataJSON({
      type: 'webauthn.create',
      challenge,
      origin: 'https://evil.example',
    });
    const authData = buildAuthenticatorData({
      rpID: config.rpID,
      counter: 0,
      credential: { id: credId, publicKeyCose: keys.cose },
    });
    const response: RegistrationResponseJSON = {
      id: b64urlEncode(credId),
      rawId: b64urlEncode(credId),
      type: 'public-key',
      response: {
        clientDataJSON: b64urlEncode(clientDataJSON),
        attestationObject: b64urlEncode(noneAttestation(authData)),
      },
    };
    expect(() => verifyRegistrationResponse(config, challenge, response)).toThrow(/origin/);
  });
});

describe('authentication ceremony', () => {
  function enrolled(): {
    keys: ReturnType<typeof makeKeyPair>;
    credential: StoredWebAuthnCredential;
    credId: Buffer;
  } {
    const keys = makeKeyPair();
    const credId = randomBytes(16);
    return {
      keys,
      credId,
      credential: {
        credentialId: b64urlEncode(credId),
        publicKey: b64urlEncode(keys.cose),
        counter: 1,
        createdAt: new Date().toISOString(),
      },
    };
  }

  it('accepts a valid assertion and returns the new counter', () => {
    const { keys, credential, credId } = enrolled();
    const challenge = generateChallenge();
    const clientDataJSON = buildClientDataJSON({
      type: 'webauthn.get',
      challenge,
      origin: config.origin,
    });
    const authData = buildAuthenticatorData({ rpID: config.rpID, counter: 2 });
    const signature = signAssertion(keys.privateKey, authData, clientDataJSON);

    const response: AuthenticationResponseJSON = {
      id: b64urlEncode(credId),
      rawId: b64urlEncode(credId),
      type: 'public-key',
      response: {
        clientDataJSON: b64urlEncode(clientDataJSON),
        authenticatorData: b64urlEncode(authData),
        signature: b64urlEncode(signature),
      },
    };

    const result = verifyAuthenticationResponse(config, challenge, credential, response);
    expect(result.newCounter).toBe(2);
  });

  it('rejects a signature from a different key', () => {
    const { credential, credId } = enrolled();
    const impostor = makeKeyPair();
    const challenge = generateChallenge();
    const clientDataJSON = buildClientDataJSON({
      type: 'webauthn.get',
      challenge,
      origin: config.origin,
    });
    const authData = buildAuthenticatorData({ rpID: config.rpID, counter: 2 });
    const signature = signAssertion(impostor.privateKey, authData, clientDataJSON);

    const response: AuthenticationResponseJSON = {
      id: b64urlEncode(credId),
      rawId: b64urlEncode(credId),
      type: 'public-key',
      response: {
        clientDataJSON: b64urlEncode(clientDataJSON),
        authenticatorData: b64urlEncode(authData),
        signature: b64urlEncode(signature),
      },
    };

    expect(() => verifyAuthenticationResponse(config, challenge, credential, response)).toThrow(/signature/);
  });

  it('rejects a counter that did not advance', () => {
    const { keys, credential, credId } = enrolled();
    const challenge = generateChallenge();
    const clientDataJSON = buildClientDataJSON({
      type: 'webauthn.get',
      challenge,
      origin: config.origin,
    });
    // stored counter is 1; present 1 again
    const authData = buildAuthenticatorData({ rpID: config.rpID, counter: 1 });
    const signature = signAssertion(keys.privateKey, authData, clientDataJSON);
    const response: AuthenticationResponseJSON = {
      id: b64urlEncode(credId),
      rawId: b64urlEncode(credId),
      type: 'public-key',
      response: {
        clientDataJSON: b64urlEncode(clientDataJSON),
        authenticatorData: b64urlEncode(authData),
        signature: b64urlEncode(signature),
      },
    };
    expect(() => verifyAuthenticationResponse(config, challenge, credential, response)).toThrow(/counter/);
  });
});

describe('options builders', () => {
  it('exclude already-registered credentials on registration', () => {
    const existing: StoredWebAuthnCredential[] = [
      { credentialId: 'abc', publicKey: 'pk', counter: 0, createdAt: new Date().toISOString(), transports: ['usb'] },
    ];
    const opts = createRegistrationOptions(
      config,
      { id: '11111111-1111-4111-8111-111111111111', name: 'alice', displayName: 'Alice' },
      existing,
      'chal',
    );
    expect(opts.excludeCredentials).toEqual([{ type: 'public-key', id: 'abc', transports: ['usb'] }]);
    expect(opts.pubKeyCredParams).toEqual([{ type: 'public-key', alg: -7 }]);
    expect(opts.attestation).toBe('none');
  });

  it('lists allowCredentials on authentication', () => {
    const opts = createAuthenticationOptions(
      config,
      [{ credentialId: 'xyz', publicKey: 'pk', counter: 0, createdAt: new Date().toISOString() }],
      'chal',
    );
    expect(opts.allowCredentials).toEqual([{ type: 'public-key', id: 'xyz' }]);
    expect(opts.rpId).toBe('localhost');
  });
});
