import { describe, expect, it } from 'vitest';
import { size } from 'viem';
import type { Address, Hex } from 'viem';
import {
  decodeSignatureEnvelope,
  encodeSignatureEnvelope,
  getUserOperationHash,
  packUserOperation,
  SignatureEnvelopeError,
  type UserOperation,
} from './userop.js';

const ENTRY_POINT: Address = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const ACCOUNT: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SIGNATURE = `0x${'ab'.repeat(65)}` as Hex;

function op(overrides: Partial<UserOperation> = {}): UserOperation {
  return {
    sender: ACCOUNT,
    nonce: 7n,
    callData: '0xdeadbeef',
    callGasLimit: 100_000n,
    verificationGasLimit: 200_000n,
    preVerificationGas: 50_000n,
    maxFeePerGas: 1_000_000_000n,
    maxPriorityFeePerGas: 100_000_000n,
    signature: encodeSignatureEnvelope('owner', SIGNATURE),
    ...overrides,
  };
}

describe('user operation packing (ERC-4337 v0.7)', () => {
  it('packs the two gas limits into one 32-byte word, verification first', () => {
    const packed = packUserOperation(op());
    expect(size(packed.accountGasLimits)).toBe(32);
    expect(packed.accountGasLimits.slice(2, 34)).toBe(200_000n.toString(16).padStart(32, '0'));
    expect(packed.accountGasLimits.slice(34)).toBe(100_000n.toString(16).padStart(32, '0'));
  });

  it('packs the fees with priority fee first', () => {
    const packed = packUserOperation(op());
    expect(size(packed.gasFees)).toBe(32);
    expect(packed.gasFees.slice(2, 34)).toBe(100_000_000n.toString(16).padStart(32, '0'));
  });

  it('leaves initCode and paymasterAndData empty when unused', () => {
    const packed = packUserOperation(op());
    expect(packed.initCode).toBe('0x');
    expect(packed.paymasterAndData).toBe('0x');
  });

  it('concatenates the factory and its calldata into initCode', () => {
    const factory: Address = '0x1111111111111111111111111111111111111111';
    const packed = packUserOperation(op({ factory, factoryData: '0xc0ffee' }));
    expect(packed.initCode.toLowerCase()).toBe(`${factory}c0ffee`.toLowerCase());
  });
});

describe('the operation hash', () => {
  it('is deterministic', () => {
    const a = getUserOperationHash({ userOp: op(), entryPoint: ENTRY_POINT, chainId: 8453 });
    const b = getUserOperationHash({ userOp: op(), entryPoint: ENTRY_POINT, chainId: 8453 });
    expect(a).toBe(b);
    expect(size(a)).toBe(32);
  });

  it('excludes the signature — otherwise nothing could sign it', () => {
    const a = getUserOperationHash({ userOp: op(), entryPoint: ENTRY_POINT, chainId: 8453 });
    const b = getUserOperationHash({
      userOp: op({ signature: encodeSignatureEnvelope('session', `0x${'cd'.repeat(65)}` as Hex) }),
      entryPoint: ENTRY_POINT,
      chainId: 8453,
    });
    expect(a).toBe(b);
  });

  it('binds the chain id — an operation cannot be replayed onto another chain', () => {
    const a = getUserOperationHash({ userOp: op(), entryPoint: ENTRY_POINT, chainId: 1 });
    const b = getUserOperationHash({ userOp: op(), entryPoint: ENTRY_POINT, chainId: 8453 });
    expect(a).not.toBe(b);
  });

  it('binds the entry point', () => {
    const a = getUserOperationHash({ userOp: op(), entryPoint: ENTRY_POINT, chainId: 1 });
    const b = getUserOperationHash({
      userOp: op(),
      entryPoint: '0x0000000000000000000000000000000000000042',
      chainId: 1,
    });
    expect(a).not.toBe(b);
  });

  it('changes with the calldata — the relay cannot alter what was signed', () => {
    const a = getUserOperationHash({ userOp: op(), entryPoint: ENTRY_POINT, chainId: 1 });
    const b = getUserOperationHash({ userOp: op({ callData: '0xdeadbeee' }), entryPoint: ENTRY_POINT, chainId: 1 });
    expect(a).not.toBe(b);
  });

  it('changes with the nonce, so a relayed operation cannot be replayed', () => {
    const a = getUserOperationHash({ userOp: op(), entryPoint: ENTRY_POINT, chainId: 1 });
    const b = getUserOperationHash({ userOp: op({ nonce: 8n }), entryPoint: ENTRY_POINT, chainId: 1 });
    expect(a).not.toBe(b);
  });
});

describe('the signature envelope', () => {
  it('round-trips both modes', () => {
    for (const mode of ['owner', 'session'] as const) {
      expect(decodeSignatureEnvelope(encodeSignatureEnvelope(mode, SIGNATURE))).toEqual({
        mode,
        signature: SIGNATURE,
      });
    }
  });

  it('marks the owner mode 0x00 and the session mode 0x01, matching SmartAccount', () => {
    expect(encodeSignatureEnvelope('owner', SIGNATURE).slice(0, 4)).toBe('0x00');
    expect(encodeSignatureEnvelope('session', SIGNATURE).slice(0, 4)).toBe('0x01');
  });

  it('refuses a signature that is not 65 bytes', () => {
    expect(() => encodeSignatureEnvelope('owner', '0xdead')).toThrow(SignatureEnvelopeError);
  });

  it('refuses an unknown mode rather than guessing at authority', () => {
    expect(() => decodeSignatureEnvelope(`0x07${SIGNATURE.slice(2)}` as Hex)).toThrow(/Unknown signature mode/);
  });
});
