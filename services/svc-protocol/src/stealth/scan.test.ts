import { describe, expect, it } from 'vitest';
import { keccak256, stringToHex, type Hex } from 'viem';
import { publicKeyToAddress } from 'viem/accounts';
import { presentationAddress } from './presentation.js';
import {
  checkStealthAddress,
  computeStealthKey,
  EIP5564_SECP256K1_SCHEME_ID,
  generateStealthAddress,
  publicKeyFromPrivate,
  scanAnnouncements,
  stealthMetaAddress,
  type StealthAnnouncement,
} from './scan.js';

const spend = `0x${'11'.repeat(32)}` as Hex;
const view = `0x${'22'.repeat(32)}` as Hex;
const ephA = `0x${'33'.repeat(32)}` as Hex;
const ephB = `0x${'55'.repeat(32)}` as Hex;
const strangerView = `0x${'44'.repeat(32)}` as Hex;

const meta = stealthMetaAddress(publicKeyFromPrivate(spend), publicKeyFromPrivate(view));

function asAnnouncement(generated: ReturnType<typeof generateStealthAddress>, metadata = generated.metadata): StealthAnnouncement {
  return {
    schemeId: generated.schemeId,
    stealthAddress: generated.stealthAddress,
    ephemeralPubKey: generated.ephemeralPubKey,
    metadata,
  };
}

describe('S-L3 ERC-5564 scheme-1 ECDH scanner', () => {
  it('sender and recipient derive the same stealth address, and two ephemerals do not collide', () => {
    const a = generateStealthAddress(meta, ephA);
    const b = generateStealthAddress(meta, ephB);
    expect(a.schemeId).toBe(EIP5564_SECP256K1_SCHEME_ID);
    expect(a.stealthAddress).not.toBe(b.stealthAddress);
    expect(a.ephemeralPubKey).not.toBe(b.ephemeralPubKey);
    expect(checkStealthAddress(asAnnouncement(a), view, publicKeyFromPrivate(spend))).toBe(true);
    expect(checkStealthAddress(asAnnouncement(b), view, publicKeyFromPrivate(spend))).toBe(true);
  });

  it('a stranger viewing key cannot recognise the announcement', () => {
    const generated = generateStealthAddress(meta, ephA);
    const hits = scanAnnouncements([asAnnouncement(generated)], strangerView, publicKeyFromPrivate(spend));
    expect(hits).toEqual([]);
  });

  it('view-tag mismatch skips the announcement even when the address would match', () => {
    const generated = generateStealthAddress(meta, ephA);
    const flipped = asAnnouncement(generated, `0x${((generated.viewTag + 1) % 256).toString(16).padStart(2, '0')}`);
    expect(checkStealthAddress(flipped, view, publicKeyFromPrivate(spend))).toBe(false);
  });

  it('computeStealthKey spends the derived address and is not the spending key', () => {
    const generated = generateStealthAddress(meta, ephA);
    const stealthKey = computeStealthKey(asAnnouncement(generated), view, spend);
    expect(publicKeyToAddress(publicKeyFromPrivate(stealthKey, false))).toBe(generated.stealthAddress);
    expect(stealthKey).not.toBe(spend);
  });

  it('keccak P0 presentations are not ECDH matches — do not join schemes', () => {
    const ephemeral = keccak256(stringToHex('ephemeral-a'));
    const keccakPresentation = presentationAddress(keccak256(stringToHex('spending-key-id-fixture')), ephemeral);
    const fake: StealthAnnouncement = {
      schemeId: EIP5564_SECP256K1_SCHEME_ID,
      stealthAddress: keccakPresentation,
      ephemeralPubKey: publicKeyFromPrivate(ephA),
      metadata: '0x00',
    };
    expect(scanAnnouncements([fake], view, publicKeyFromPrivate(spend))).toEqual([]);
  });

  it('scan is aggregate-only: hits carry addresses, never a user id field', () => {
    const generated = generateStealthAddress(meta, ephA);
    const hits = scanAnnouncements([asAnnouncement(generated)], view, publicKeyFromPrivate(spend));
    expect(hits).toHaveLength(1);
    expect(Object.keys(hits[0]!).sort()).toEqual(['ephemeralPubKey', 'stealthAddress', 'viewTag']);
    expect(JSON.stringify(hits)).not.toMatch(/userId|profile|email|kyc/i);
  });
});
