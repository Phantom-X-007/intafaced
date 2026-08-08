/**
 * S-A1 adversarial audit package — INTERNAL matrix.
 *
 * Every test maps to a row in docs/audits/protocol-smart-accounts-2026-08-08.md §1.
 * Passing this suite does NOT justify `audited:true` or closing socket.contract-audit
 * (external firm / Nitro budget still required). It is the engineering half of the package.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toFunctionSelector, type Address, type Hex } from 'viem';
import { loadArtifact } from '../chain/artifacts.js';
import { getUserOperationHash, packUserOperation, encodeSignatureEnvelope } from '../chain/userop.js';
import {
  createSessionSpec,
  evaluateSessionCall,
  FORBIDDEN_SIGNATURES,
  SessionScopeError,
  sessionSpecInputSchema,
  type SessionSpecInput,
} from '../session/spec.js';

const ACCOUNT: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SESSION_KEY: Address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const VENUE: Address = '0xcccccccccccccccccccccccccccccccccccccccc';
const ENTRY_POINT: Address = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const NOW = 1_800_000_000;
const SWAP = toFunctionSelector('swapExactTokensForTokens(uint256,uint256,address[],address,uint256)');

const here = dirname(fileURLToPath(import.meta.url));
const contractsDir = join(here, '..', '..', 'contracts');

function input(overrides: Partial<SessionSpecInput> = {}): SessionSpecInput {
  return sessionSpecInputSchema.parse({
    key: SESSION_KEY,
    validAfter: 0,
    validUntil: NOW + 3600,
    spendLimitWei: '1000000000000000000',
    targets: [VENUE],
    selectors: [SWAP],
    ...overrides,
  });
}

function abiFnNames(contract: 'SmartAccount' | 'AccountFactory'): string[] {
  const artifact = loadArtifact(contract);
  const names: string[] = [];
  for (const item of artifact.abi) {
    if (item.type === 'function') names.push(item.name);
  }
  return names.sort();
}

describe('S-A1 adversarial · platform cannot move funds without a user signature', () => {
  it('SmartAccount ABI has no admin / pause / upgrade / guardian entrypoints', () => {
    const names = abiFnNames('SmartAccount');
    const forbidden = [
      'pause',
      'unpause',
      'setAdmin',
      'setGuardian',
      'addGuardian',
      'upgradeTo',
      'upgradeToAndCall',
      'transferOwnership',
      'renounceOwnership',
    ];
    for (const name of forbidden) {
      expect(names, `platform control surface leaked: ${name}`).not.toContain(name);
    }
  });

  it('AccountFactory ABI has no upgrade / pause / admin', () => {
    const names = abiFnNames('AccountFactory');
    for (const name of ['pause', 'upgradeTo', 'setImplementation', 'setAdmin']) {
      expect(names).not.toContain(name);
    }
  });

  it('SmartAccount.sol has no admin/pause/guardian control surface (NatSpec may name the refusal)', () => {
    const src = readFileSync(join(contractsDir, 'SmartAccount.sol'), 'utf8');
    expect(src).not.toMatch(/function\s+pause\b/);
    expect(src).not.toMatch(/function\s+unpause\b/);
    expect(src).not.toMatch(/\bonlyOwner\b/);
    expect(src).not.toMatch(/\bonlyAdmin\b/);
    expect(src).not.toMatch(/mapping\s*\(.*[Gg]uardian/);
  });
});

describe('S-A1 adversarial · malicious bundler cannot swap callData after signature', () => {
  it('userOp hash binds callData — changing callData changes the hash', () => {
    const base = {
      sender: ACCOUNT,
      nonce: 1n,
      callData: '0xdeadbeef' as Hex,
      callGasLimit: 100_000n,
      verificationGasLimit: 200_000n,
      preVerificationGas: 50_000n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
      signature: encodeSignatureEnvelope('owner', `0x${'ab'.repeat(65)}` as Hex),
    };
    const a = getUserOperationHash({ userOp: base, entryPoint: ENTRY_POINT, chainId: 8453 });
    const b = getUserOperationHash({
      userOp: { ...base, callData: '0xcafebabe' as Hex },
      entryPoint: ENTRY_POINT,
      chainId: 8453,
    });
    expect(a).not.toBe(b);
  });

  it('packed userOp still carries the same callData the hash covered', () => {
    const callData = '0x11223344' as Hex;
    const packed = packUserOperation({
      sender: ACCOUNT,
      nonce: 0n,
      callData,
      callGasLimit: 1n,
      verificationGasLimit: 1n,
      preVerificationGas: 1n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
      signature: encodeSignatureEnvelope('owner', `0x${'11'.repeat(65)}` as Hex),
    });
    expect(packed.callData).toBe(callData);
  });
});

describe('S-A1 adversarial · session key thief cannot drain beyond grant', () => {
  it('refuses every known outbound-transfer / upgrade selector at grant time', () => {
    for (const signature of FORBIDDEN_SIGNATURES) {
      expect(() => createSessionSpec(input({ selectors: [toFunctionSelector(signature)] }), { account: ACCOUNT, now: NOW })).toThrow(
        SessionScopeError,
      );
    }
  });

  it('refuses a session that targets the account itself (self-widen / rotate owner)', () => {
    expect(() => createSessionSpec(input({ targets: [ACCOUNT] }), { account: ACCOUNT, now: NOW })).toThrow(SessionScopeError);
  });

  it('evaluateSessionCall refuses a selector not on the allowlist', () => {
    const s = createSessionSpec(input(), { account: ACCOUNT, now: NOW });
    const transfer = toFunctionSelector('transfer(address,uint256)');
    const d = evaluateSessionCall({
      spec: s,
      account: ACCOUNT,
      target: VENUE,
      value: 0n,
      data: transfer,
      spentWei: 0n,
      now: NOW,
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('session.selector_not_allowed');
  });

  it('evaluateSessionCall refuses a target not on the allowlist', () => {
    const s = createSessionSpec(input(), { account: ACCOUNT, now: NOW });
    const other: Address = '0xdddddddddddddddddddddddddddddddddddddddd';
    const d = evaluateSessionCall({
      spec: s,
      account: ACCOUNT,
      target: other,
      value: 0n,
      data: SWAP,
      spentWei: 0n,
      now: NOW,
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('session.target_not_allowed');
  });

  it('evaluateSessionCall refuses spend past the cumulative wei cap', () => {
    const s = createSessionSpec(input({ spendLimitWei: '100' }), { account: ACCOUNT, now: NOW });
    const d = evaluateSessionCall({
      spec: s,
      account: ACCOUNT,
      target: VENUE,
      value: 101n,
      data: SWAP,
      spentWei: 0n,
      now: NOW,
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe('session.spend_limit_exceeded');
  });

  it('property: random forbidden selector buried in a legitimate list still fails grant', () => {
    for (let i = 0; i < 32; i++) {
      const forbidden = FORBIDDEN_SIGNATURES[i % FORBIDDEN_SIGNATURES.length]!;
      expect(() =>
        createSessionSpec(
          input({
            selectors: [SWAP, toFunctionSelector(forbidden), SWAP],
          }),
          { account: ACCOUNT, now: NOW },
        ),
      ).toThrow(SessionScopeError);
    }
  });
});

describe('S-A1 adversarial · SessionKeyLib.sol and TypeScript refuse the same selectors', () => {
  it('every FORBIDDEN_SIGNATURES selector is hard-coded in SessionKeyLib.sol', () => {
    const sol = readFileSync(join(contractsDir, 'SessionKeyLib.sol'), 'utf8');
    for (const signature of FORBIDDEN_SIGNATURES) {
      const sel = toFunctionSelector(signature).toLowerCase();
      expect(sol.toLowerCase(), `SessionKeyLib missing ${signature} (${sel})`).toContain(sel.slice(2));
    }
  });
});
