import { describe, expect, it } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client';
import { CardSandboxAdapter } from './card-sandbox.js';
import { CryptoNativeAdapter } from './crypto-native.js';
import { ChainNotConfiguredError, MemoryChain, UnconfiguredChain } from './chain-port.js';
import { RailRegistry } from './registry.js';
import { isUsable } from './rail-adapter.js';
import {
  RAIL_POSTURE_ENFORCED_ENVS,
  SandboxRailError,
  SandboxRailRefusal,
  assertRailMayMoveValue,
  assertRailPosture,
  defaultChainFor,
  railPostureStatus,
} from './posture.js';

/**
 * RAILS THAT ARE HONEST ABOUT NOT BEING REAL.
 *
 * WHAT WAS WRONG. `index.ts` wired `new MemoryChain()` unconditionally and
 * registered `card-sandbox` beside it. Both declare `payout`. Nothing anywhere
 * distinguished a rail with a counterparty from a rail with a `Map`, so on any
 * deployment a user could call `withdrawal.create` with `railId: 'crypto-native'`
 * and be told `sent` against a transaction hash this process made up.
 *
 * WHAT EACH TEST HERE IS FOR. Every one of them fails if the platform regains
 * the ability to tell somebody their money moved when it did not. That is the
 * only bug in this service with no recovery path: it is not detectable from
 * inside the books, because a fabricated settlement satisfies double entry
 * exactly as well as a real one, and the user has been believing it the whole
 * time.
 */

const SECRET = 'posture-test-secret-at-least-32-chars-long';

const cardSandbox = () => new CardSandboxAdapter({ secret: SECRET });
const cryptoOn = (chain: MemoryChain | UnconfiguredChain) => new CryptoNativeAdapter({ chain, secret: SECRET, minConfirmations: 6 });

/** A minimal live rail. There is no live adapter in the repo yet, so the test states one. */
const liveRail = () => {
  const adapter = cardSandbox();
  return new Proxy(adapter, {
    get(target, prop, receiver) {
      if (prop === 'mode') return 'live';
      if (prop === 'id') return 'live-acquirer-double';
      return Reflect.get(target, prop, receiver);
    },
  }) as CardSandboxAdapter;
};

const payout = {
  settlementId: 's-1:0',
  merchantId: '55555555-5555-4555-8555-555555555555',
  amount: amt('100'),
  assetId: 'USDT',
  window: 'w',
  destination: { kind: 'crypto', ref: '0xdest' },
};

// ══ THE DECLARATION ═════════════════════════════════════════════════════════

describe('every rail says whether it is real', () => {
  it('card-sandbox is a sandbox, and there is no option that changes it', () => {
    expect(cardSandbox().mode).toBe('sandbox');
    // The counterparty is a Map in the same file. A flag would be a lie, so
    // there is no flag: a live card rail is a different adapter.
    expect(Object.keys(new CardSandboxAdapter({ secret: SECRET }))).not.toContain('live');
  });

  it('crypto-native is a SANDBOX when MemoryChain is behind it, whatever §13 says about day one', () => {
    // §13 reads "`crypto-native` is real from day one". True of the adapter,
    // false of this deployment — and the deployment is what a user's money
    // depends on. The adapter derives its answer from the port rather than
    // being told.
    expect(cryptoOn(new MemoryChain()).mode).toBe('sandbox');
  });

  it('crypto-native is a sandbox with NO chain too — an absent chain is not a live one', () => {
    expect(cryptoOn(new UnconfiguredChain()).mode).toBe('sandbox');
  });

  it('reports an absent chain as UNHEALTHY, so routing and the console never offer it', () => {
    const absent = cryptoOn(new UnconfiguredChain());
    expect(absent.health().healthy).toBe(false);
    expect(isUsable(absent, new Date())).toBe(false);

    // A sandbox chain stays healthy on purpose: it genuinely works, which is
    // what CI needs. `mode` is what stops it moving real money, not health.
    expect(cryptoOn(new MemoryChain()).health().healthy).toBe(true);
  });
});

// ══ THE CHAIN THAT REFUSES ══════════════════════════════════════════════════

describe('UnconfiguredChain — refuses, never fabricates', () => {
  const chain = new UnconfiguredChain();

  it('NEVER RETURNS A TRANSACTION HASH', async () => {
    // The single most important assertion in this file. `MemoryChain.send`
    // answers `0xout00000001` and that string reaches the user as evidence
    // their withdrawal was sent.
    await expect(chain.send()).rejects.toBeInstanceOf(ChainNotConfiguredError);
  });

  it('refuses to derive an acceptance address rather than inviting a payer to send funds nowhere', async () => {
    await expect(chain.acceptanceAddress()).rejects.toBeInstanceOf(ChainNotConfiguredError);
  });

  it('THROWS rather than returning null for an inbound transfer', async () => {
    // Null means "the payer has not sent anything yet" — a fact about the payer.
    // This is a fact about us, and collapsing them leaves `authorize` reporting
    // `pending` forever on a rail that will never answer.
    await expect(chain.inboundTransfer()).rejects.toBeInstanceOf(ChainNotConfiguredError);
  });

  it('names what the owner must obtain, in the error a human will actually read', async () => {
    const err = await chain.send().catch((e: unknown) => e as Error);
    expect(err.message).toMatch(/RPC provider/i);
    expect(err.message).toMatch(/signing keys/i);
    expect(err.message).toMatch(/PAY_MIN_CONFIRMATIONS/);
    expect(err.message).toMatch(/chain watcher/i);
  });

  it('turns into a rail FAILURE at the adapter, not an escaped exception', async () => {
    // What makes the refusal safe: `UserMoneyService` reverses the hold on a
    // failed result in the same call, so the user gets their money back. An
    // exception escaping the adapter would leave the hold in place.
    const result = await cryptoOn(chain).payout(payout);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('failed');
    // NOT `chain.broadcast_failed`. That reads as transient and sends an
    // operator to look at a node that does not exist; nothing configured will
    // never fix itself.
    expect(result.failureCode).toBe('chain.not_configured');
    // And no reference was invented on the way out.
    expect(result.railRef).toBe('');
  });
});

// ══ THE BOOT GATE ═══════════════════════════════════════════════════════════

describe('assertRailPosture — the process refuses to start rather than mislead', () => {
  const sandboxRegistry = () => new RailRegistry([cardSandbox(), cryptoOn(new MemoryChain())]);

  it.each(RAIL_POSTURE_ENFORCED_ENVS)('REFUSES TO BOOT in APP_ENV=%s with a sandbox rail registered', (appEnv) => {
    expect(() => assertRailPosture(sandboxRegistry(), { APP_ENV: appEnv })).toThrow(SandboxRailError);
  });

  it('names every sandbox rail in the refusal, so the operator knows what to replace', () => {
    const err = (() => {
      try {
        assertRailPosture(sandboxRegistry(), { APP_ENV: 'prod' });
        return null;
      } catch (e) {
        return e as SandboxRailError;
      }
    })();

    expect(err).toBeInstanceOf(SandboxRailError);
    expect(err!.sandboxRails).toEqual(['card-sandbox', 'crypto-native']);
    // And what to obtain for each kind, because "get a live rail" is not
    // actionable and "get a sponsor bank" is.
    expect(err!.message).toMatch(/sponsor bank/i);
    expect(err!.message).toMatch(/conformance kit/i);
  });

  it('boots in dev and test — the sandbox rails ARE the fixture there', () => {
    for (const appEnv of ['dev', 'test']) {
      const posture = assertRailPosture(sandboxRegistry(), { APP_ENV: appEnv });
      expect(posture.policy).toBe('allow-sandbox');
      expect(posture.sandboxOverride).toBe(false);
    }
  });

  it('defaults to dev when APP_ENV is unset, rather than failing every local run', () => {
    expect(() => assertRailPosture(sandboxRegistry(), {})).not.toThrow();
  });

  it('boots in prod with only LIVE rails, and enforces live-only from then on', () => {
    const posture = assertRailPosture(new RailRegistry([liveRail()]), { APP_ENV: 'prod' });
    expect(posture.policy).toBe('live-only');
  });

  it('lets an operator override BY NAME, and records that they did', () => {
    // A pilot or a demo is legitimate. Doing it silently is not.
    const posture = assertRailPosture(sandboxRegistry(), { APP_ENV: 'prod', PAY_ALLOW_SANDBOX_RAILS: 'true' });
    expect(posture.policy).toBe('allow-sandbox');
    expect(posture.sandboxOverride).toBe(true);
  });

  it('does not accept anything other than the exact string "true" as an override', () => {
    for (const value of ['1', 'yes', 'TRUE', 'true ', '']) {
      expect(() => assertRailPosture(sandboxRegistry(), { APP_ENV: 'prod', PAY_ALLOW_SANDBOX_RAILS: value })).toThrow(SandboxRailError);
    }
  });
});

// ══ THE RUNTIME GATE ════════════════════════════════════════════════════════

describe('assertRailMayMoveValue — the second gate, because boot config drifts', () => {
  it('REFUSES A SANDBOX PAYOUT under live-only', () => {
    expect(() => assertRailMayMoveValue(cardSandbox(), 'payout', 'live-only')).toThrow(SandboxRailRefusal);
  });

  it('refuses a sandbox refund under live-only — a refund is value leaving too', () => {
    expect(() => assertRailMayMoveValue(cardSandbox(), 'refund', 'live-only')).toThrow(SandboxRailRefusal);
  });

  it('allows a live rail to do either', () => {
    expect(() => assertRailMayMoveValue(liveRail(), 'payout', 'live-only')).not.toThrow();
    expect(() => assertRailMayMoveValue(liveRail(), 'refund', 'live-only')).not.toThrow();
  });

  it('ALLOWS a sandbox authorize and capture even under live-only', () => {
    // Deliberate, and the asymmetry is the argument: authorize/capture bring
    // value IN. If a sandbox capture credits a merchant who was never paid, the
    // platform is short — caught by reconciling the rail boundary against real
    // custody, which is the figure that exists for it. Nobody has been told
    // their own money left.
    expect(() => assertRailMayMoveValue(cardSandbox(), 'authorize', 'live-only')).not.toThrow();
    expect(() => assertRailMayMoveValue(cardSandbox(), 'capture', 'live-only')).not.toThrow();
  });

  it('allows everything under allow-sandbox — dev and the whole test suite depend on it', () => {
    for (const capability of ['authorize', 'capture', 'refund', 'payout', 'webhook'] as const) {
      expect(() => assertRailMayMoveValue(cardSandbox(), capability, 'allow-sandbox')).not.toThrow();
    }
  });

  it('carries a machine-readable code, so the router can map it rather than parse prose', () => {
    const err = (() => {
      try {
        assertRailMayMoveValue(cardSandbox(), 'payout', 'live-only');
        return null;
      } catch (e) {
        return e as SandboxRailRefusal;
      }
    })();
    expect(err!.code).toBe('pay.rail_not_live');
    expect(err!.railId).toBe('card-sandbox');
    // States plainly that nothing was touched — the caller needs to know there
    // is nothing to unwind.
    expect(err!.message).toMatch(/no hold has been placed/i);
  });
});

// ══ WHAT AN OPERATOR IS TOLD ════════════════════════════════════════════════

describe('railPostureStatus — "how many rails can actually send money"', () => {
  it('separates live from sandbox, where the id list alone could not', () => {
    const status = railPostureStatus(new RailRegistry([cardSandbox(), liveRail()]), 'allow-sandbox');
    expect(status.live).toEqual(['live-acquirer-double']);
    expect(status.sandbox).toEqual(['card-sandbox']);
  });

  it('says out loud that a permitted sandbox fabricates its references', () => {
    const status = railPostureStatus(new RailRegistry([cardSandbox()]), 'allow-sandbox');
    expect(status.summary).toMatch(/SANDBOX RAILS MAY MOVE VALUE/);
    expect(status.summary).toMatch(/nothing leaves/i);
  });

  it('reports the refusal when the policy is live-only', () => {
    const status = railPostureStatus(new RailRegistry([cardSandbox()]), 'live-only');
    expect(status.summary).toMatch(/refused for payout and refund/);
  });

  it('is quiet when every rail is real — a clean posture needs no warning', () => {
    const status = railPostureStatus(new RailRegistry([liveRail()]), 'live-only');
    expect(status.sandbox).toEqual([]);
    expect(status.summary).toBe('rails: 1 live [live-acquirer-double], 0 sandbox');
  });
});

// ══ THE PRODUCTION WIRING ═══════════════════════════════════════════════════

describe('defaultChainFor — what index.ts actually gets', () => {
  it.each(RAIL_POSTURE_ENFORCED_ENVS)('gives APP_ENV=%s a chain that REFUSES, not one that simulates', (appEnv) => {
    const chain = defaultChainFor({ APP_ENV: appEnv });
    expect(chain.posture).toBe('absent');
    expect(chain).toBeInstanceOf(UnconfiguredChain);
  });

  it('gives dev and test the in-memory reference chain the suite is built on', () => {
    for (const appEnv of ['dev', 'test', undefined]) {
      const chain = defaultChainFor(appEnv === undefined ? {} : { APP_ENV: appEnv });
      expect(chain.posture).toBe('sandbox');
      expect(chain).toBeInstanceOf(MemoryChain);
    }
  });

  it('describes itself in one line an operator can read on /ready', () => {
    expect(defaultChainFor({ APP_ENV: 'prod' }).description).toMatch(/NO CHAIN CONFIGURED/);
    expect(defaultChainFor({ APP_ENV: 'dev' }).description).toMatch(/no transaction reaches any chain/);
  });
});
