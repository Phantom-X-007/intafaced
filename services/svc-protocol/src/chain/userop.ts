import { concat, encodeAbiParameters, keccak256, numberToHex } from 'viem';
import type { Address, Hex } from 'viem';

/**
 * ERC-4337 v0.7 user operations.
 *
 * A user operation is the only way anything happens on a smart account, and its
 * hash is what the user signs. This file exists so that this service can
 * recompute that hash independently — which is the whole basis on which the
 * relay can refuse to forward something the user did not authorise.
 *
 * §13 socket `socket.userop-differential-test`: these bytes are asserted
 * self-consistent and pinned against golden vectors here, but they are not yet
 * checked against a live EntryPoint's `getUserOpHash`. That check lands with the
 * contract toolchain.
 */

export interface UserOperation {
  sender: Address;
  nonce: bigint;
  /** Deployment, first operation only. */
  factory?: Address;
  factoryData?: Hex;
  callData: Hex;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymaster?: Address;
  paymasterVerificationGasLimit?: bigint;
  paymasterPostOpGasLimit?: bigint;
  paymasterData?: Hex;
  /** `<mode byte> ++ <65-byte ECDSA>`. See SmartAccount MODE_OWNER / MODE_SESSION. */
  signature: Hex;
}

export interface PackedUserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex;
  preVerificationGas: bigint;
  gasFees: Hex;
  paymasterAndData: Hex;
  signature: Hex;
}

/** Two uint128s in one word — the v0.7 packing. */
function packTwo(high: bigint, low: bigint): Hex {
  return concat([numberToHex(high, { size: 16 }), numberToHex(low, { size: 16 })]);
}

export function packUserOperation(op: UserOperation): PackedUserOperation {
  const initCode: Hex = op.factory ? concat([op.factory, op.factoryData ?? '0x']) : '0x';

  const paymasterAndData: Hex = op.paymaster
    ? concat([
        op.paymaster,
        numberToHex(op.paymasterVerificationGasLimit ?? 0n, { size: 16 }),
        numberToHex(op.paymasterPostOpGasLimit ?? 0n, { size: 16 }),
        op.paymasterData ?? '0x',
      ])
    : '0x';

  return {
    sender: op.sender,
    nonce: op.nonce,
    initCode,
    callData: op.callData,
    accountGasLimits: packTwo(op.verificationGasLimit, op.callGasLimit),
    preVerificationGas: op.preVerificationGas,
    gasFees: packTwo(op.maxPriorityFeePerGas, op.maxFeePerGas),
    paymasterAndData,
    signature: op.signature,
  };
}

/**
 * `EntryPoint.getUserOpHash` — note the signature is deliberately excluded, so
 * the hash is what gets signed rather than something that changes when it is.
 */
export function getUserOperationHash(args: { userOp: UserOperation; entryPoint: Address; chainId: number }): Hex {
  const packed = packUserOperation(args.userOp);

  const inner = keccak256(
    encodeAbiParameters(
      [
        { type: 'address' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'bytes32' },
        { type: 'uint256' },
        { type: 'bytes32' },
        { type: 'bytes32' },
      ],
      [
        packed.sender,
        packed.nonce,
        keccak256(packed.initCode),
        keccak256(packed.callData),
        packed.accountGasLimits,
        packed.preVerificationGas,
        packed.gasFees,
        keccak256(packed.paymasterAndData),
      ],
    ),
  );

  return keccak256(
    encodeAbiParameters([{ type: 'bytes32' }, { type: 'address' }, { type: 'uint256' }], [inner, args.entryPoint, BigInt(args.chainId)]),
  );
}

/** Signature envelope modes — byte 0, matching SmartAccount. */
export const SIGNATURE_MODE = { owner: 0x00, session: 0x01 } as const;
export type SignatureMode = keyof typeof SIGNATURE_MODE;

export class SignatureEnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SignatureEnvelopeError';
  }
}

export function encodeSignatureEnvelope(mode: SignatureMode, signature: Hex): Hex {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new SignatureEnvelopeError('An ECDSA signature is 65 bytes');
  }
  return concat([numberToHex(SIGNATURE_MODE[mode], { size: 1 }), signature]);
}

export function decodeSignatureEnvelope(envelope: Hex): { mode: SignatureMode; signature: Hex } {
  if (!/^0x[0-9a-fA-F]{132}$/.test(envelope)) {
    throw new SignatureEnvelopeError('A signature envelope is 1 mode byte + 65 signature bytes');
  }
  const modeByte = Number.parseInt(envelope.slice(2, 4), 16);
  const mode = (Object.keys(SIGNATURE_MODE) as SignatureMode[]).find((k) => SIGNATURE_MODE[k] === modeByte);
  if (!mode) throw new SignatureEnvelopeError(`Unknown signature mode 0x${envelope.slice(2, 4)}`);
  return { mode, signature: `0x${envelope.slice(4)}` as Hex };
}
