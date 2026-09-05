import { describe, expect, it } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client';
import { CardSandboxAdapter } from './card-sandbox.js';
import { CryptoNativeAdapter } from './crypto-native.js';
import { MemoryChain, UnconfiguredChain } from './chain-port.js';
import { RailRegistry } from './registry.js';
import {
  RAIL_CAPABILITIES,
  RAIL_DISPUTE_STATUSES,
  RAIL_MODES,
  RailOperationUnsupportedError,
  VALUE_LEAVING_CAPABILITIES,
  acceptDispute,
  capturePartial,
  createMandate,
  fetchDispute,
  isAbsent,
  isLive,
  isSandbox,
  quoteFx,
  revokeMandate,
  submitDisputeEvidence,
  voidAuthorization,
  type RailAdapter,
  type RailCapability,
  type RailCaptureRequest,
  type RailResult,
} from './rail-adapter.js';
import {
  PublicCheckoutUnavailable,
  SandboxRailRefusal,
  assertRailMayAcceptPublicPayment,
  assertRailMayMoveValue,
  assertRailPosture,
  railPostureStatus,
  selectPublicCheckoutRail,
} from './posture.js';

/**
 * The rejection, typed.
 *
 * `.catch((e) => e as X)` widens the result to `X | <resolved type>`, so every
 * property access after it is a type error — and worse, a call that WRONGLY
 * RESOLVES reads as `undefined` on the next line instead of failing where the
 * mistake is. This fails at the call that did not throw.
 */
async function rejection<E>(promise: Promise<unknown>, kind: abstract new (...args: never[]) => E): Promise<E> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof kind) return err;
    throw err;
  }
  throw new Error(`expected ${kind.name}, but the call resolved`);
}

/**
 * THE WIDENED PORT, AND THE THIRD RAIL MODE.
 *
 * `docs/adr/2026-08-04-pay-rails-and-psp-socket.md` (Accepted) named two
 * structural gaps and four done-bar clauses. This file is the half of them that
 * lives on the port:
 *
 *   2. "Any card work extends `RailAdapter` to carry partial capture, void,
 *       next-action and dispute BEFORE an adapter is written against it."
 *   4. "`RailMode` distinguishes absent from sandbox, or states why it may not."
 *   6. "Sandbox is never reported as live, by any collapse, at any layer."
 *
 * WHAT THIS FILE DOES NOT TEST, AND MUST NOT. There is no card rail. There is no
 * acquirer — `socket.psp-partners` is a sponsor bank and an acquiring BIN, which
 * is a commercial relationship and not a code gap. Every card-shaped operation
 * below is asserted to REFUSE BY NAME, and a test that made one of them succeed
 * would be testing a fiction.
 *
 * THE PROOF THAT THE WIDENING IS NON-BREAKING is not in this file. It is in
 * `rails.test.ts` — the conformance kit, which runs both v1 adapters and which
 * this change does not touch. If widening the port had broken either adapter,
 * that file would be red, and it is not.
 */

const SECRET = 'widening-secret-at-least-32-characters-long';

const cardSandbox = () => new CardSandboxAdapter({ secret: SECRET, toleranceSeconds: 300 });
const cryptoOn = (chain: MemoryChain | UnconfiguredChain) =>
  new CryptoNativeAdapter({ chain, secret: SECRET, minConfirmations: 6, toleranceSeconds: 300 });

const captureRequest = (over: Partial<RailCaptureRequest> = {}): RailCaptureRequest => ({
  ref: 'ch_1',
  amount: amt('40'),
  final: false,
  ...over,
});

// ══ THE PORT STILL SAYS WHAT IT SAID ════════════════════════════════════════

describe('the widening is additive — the original port is intact', () => {
  it('keeps the original five capabilities, and adds rather than replaces', () => {
    for (const original of ['authorize', 'capture', 'refund', 'payout', 'webhook'] as const) {
      expect(RAIL_CAPABILITIES).toContain(original);
    }
    // The card-shaped additions the ADR named, each of which is a question the
    // core may now ask and no v1 adapter answers yes to.
    for (const added of ['capture.partial', 'void', 'dispute', 'mandate', 'fx'] as const) {
      expect(RAIL_CAPABILITIES).toContain(added);
    }
  });

  it('leaves both v1 adapters declaring EXACTLY what they declared before', () => {
    // Not "a subset" and not "at least" — exactly. A capability list that grew
    // because the type grew would mean the core started routing card operations
    // to a rail that cannot perform them, which is the failure this whole change
    // exists to prevent.
    expect([...cardSandbox().capabilities]).toEqual(['authorize', 'capture', 'refund', 'payout', 'webhook']);
    expect([...cryptoOn(new MemoryChain()).capabilities]).toEqual(['authorize', 'capture', 'refund', 'payout', 'webhook']);
  });

  it('still satisfies RailAdapter with none of the optional methods implemented', () => {
    // The structural claim, stated as an assignment the compiler checks and an
    // assertion a reader can see: `capturePartial` and friends are absent, and
    // the adapter is still a RailAdapter.
    const adapters: RailAdapter[] = [cardSandbox(), cryptoOn(new MemoryChain())];
    for (const adapter of adapters) {
      expect(adapter.capturePartial).toBeUndefined();
      expect(adapter.voidAuthorization).toBeUndefined();
      expect(adapter.fetchDispute).toBeUndefined();
      expect(adapter.createMandate).toBeUndefined();
      expect(adapter.quoteFx).toBeUndefined();
    }
  });

  it('does not grow the list of capabilities that move a user’s own money out', () => {
    // `payout` and `refund` and nothing else. The test for membership is "has a
    // user been told their own money left" — see VALUE_LEAVING_CAPABILITIES.
    // `void` in particular sounds destructive and is the opposite: it returns a
    // buyer's headroom and moves nothing.
    expect([...VALUE_LEAVING_CAPABILITIES]).toEqual(['payout', 'refund']);
  });

  it('names seven dispute statuses, and keeps the three economically-identical ones apart', () => {
    expect(RAIL_DISPUTE_STATUSES).toHaveLength(7);
    // `lost`, `accepted` and `expired` all end with the money gone. They stay
    // distinct because "we were overruled", "we decided not to fight" and "a
    // queue was not worked" are three different facts about the same loss, and
    // only the third is an operational failure.
    for (const terminal of ['lost', 'accepted', 'expired'] as const) {
      expect(RAIL_DISPUTE_STATUSES).toContain(terminal);
    }
  });
});

// ══ A RAIL THAT CANNOT DO IT REFUSES BY NAME ════════════════════════════════

describe('no silent no-op — a missing capability is an exception, not a plausible answer', () => {
  /**
   * `packages/venue-contracts/src/errors.ts` met this fork and wrote the answer:
   * "an execution port that answers plausibly while doing nothing reports fills
   * that never happened… A missing key is not a market condition. It is a
   * deployment that is not finished, and it must read like one."
   *
   * Substitute "a missing capability" and the argument is unchanged.
   */
  const everyWidenedCall: ReadonlyArray<[string, (a: RailAdapter) => Promise<unknown>]> = [
    ['capturePartial', (a) => capturePartial(a, captureRequest())],
    ['voidAuthorization', (a) => voidAuthorization(a, { ref: 'ch_1' })],
    ['fetchDispute', (a) => fetchDispute(a, 'dp_1')],
    ['submitDisputeEvidence', (a) => submitDisputeEvidence(a, { disputeId: 'dp_1', submittedBy: 'ops' })],
    ['acceptDispute', (a) => acceptDispute(a, 'dp_1')],
    ['createMandate', (a) => createMandate(a, { mandateId: 'md_1', merchantId: 'm_1', instrument: { kind: 'card' }, scheme: 'card' })],
    ['revokeMandate', (a) => revokeMandate(a, 'md_1')],
    ['quoteFx', (a) => quoteFx(a, { fromAssetId: 'EUR', toAssetId: 'USDT', amount: amt('10') })],
  ];

  it.each(everyWidenedCall)('card-sandbox refuses %s by name', async (_name, call) => {
    await expect(call(cardSandbox())).rejects.toBeInstanceOf(RailOperationUnsupportedError);
  });

  it.each(everyWidenedCall)('crypto-native refuses %s by name', async (_name, call) => {
    await expect(call(cryptoOn(new MemoryChain()))).rejects.toBeInstanceOf(RailOperationUnsupportedError);
  });

  it('does not return undefined — the refusal is thrown, so no caller can proceed past it', async () => {
    // `adapter.capturePartial?.(…)` is valid TypeScript, compiles, and evaluates
    // to `undefined`. That is the silent no-op. Going through the module-level
    // function is what makes it impossible.
    const adapter = cardSandbox() as RailAdapter;
    const direct = adapter.capturePartial?.(captureRequest());
    expect(direct).toBeUndefined();

    await expect(capturePartial(adapter, captureRequest())).rejects.toThrow(RailOperationUnsupportedError);
  });

  it('names the rail, the operation and what the reader must do next', async () => {
    const err = await rejection(capturePartial(cardSandbox(), captureRequest()), RailOperationUnsupportedError);

    expect(err.code).toBe('pay.rail_operation_unsupported');
    expect(err.railId).toBe('card-sandbox');
    expect(err.operation).toBe('capture.partial');
    expect(err.declared).toContain('capture');

    // Nothing was attempted, said in the first line, because the first question
    // an operator has is whether anything needs unwinding.
    expect(err.message).toMatch(/NOTHING WAS ATTEMPTED/);
    // A refusal is not a decline, and the message says so — a decline is a real
    // answer from a real counterparty and arrives as a RailResult.
    expect(err.message).toMatch(/not a decline/i);
    // And where the real blocker is, because "get a card rail" is not actionable.
    expect(err.message).toMatch(/sponsor bank/i);
    expect(err.message).toMatch(/psp-partners/);
  });

  it('refuses a rail that DECLARES a capability it has not implemented', async () => {
    // The half that catches real bugs. Without it this fails as
    // `adapter.capturePartial is not a function` — a TypeError thrown from
    // inside a money path, naming nothing an operator can act on and
    // indistinguishable in a log from a genuine crash.
    const liar: RailAdapter = Object.assign(Object.create(Object.getPrototypeOf(cardSandbox())) as RailAdapter, cardSandbox(), {
      capabilities: ['authorize', 'capture', 'capture.partial'] as readonly RailCapability[],
    });

    const err = await rejection(capturePartial(liar, captureRequest()), RailOperationUnsupportedError);
    expect(err).toBeInstanceOf(RailOperationUnsupportedError);
    expect(err.message).toMatch(/declare .* AND implement|Declaring without implementing/i);
  });
});

// ══ THE MONEY LAW ON THE NEW SHAPES ═════════════════════════════════════════

describe('partial capture carries an amount, and the amount is a scaled bigint', () => {
  it('is a bigint, not a number, at the type level and at runtime', () => {
    const request = captureRequest({ amount: amt('19.99') });
    expect(typeof request.amount).toBe('bigint');
    // The exact failure `Amount` exists to prevent: 19.99 as a binary float is
    // 19.989999999999998, and a merchant credited that figure has been credited
    // a number that exists in no ledger.
    expect(request.amount).toBe(19_990_000_000_000_000_000n);
    expect(request.amount).not.toBe(19.99 as unknown as bigint);
  });

  it('requires `final` rather than inferring it from the amounts', () => {
    // Nobody can infer from 40-of-100 whether the remaining 60 should be
    // released. A shipper capturing one item of two must NOT release it; a
    // merchant abandoning the rest must. Left implicit, the adapter guesses, and
    // the guess is a hold on a buyer's card that nobody ever releases.
    const partial = captureRequest({ final: false });
    const last = captureRequest({ final: true });
    expect(partial.final).toBe(false);
    expect(last.final).toBe(true);
  });

  it('keeps the FX rate off `number` too — a rate is a multiplier on money', () => {
    // Asserted on the shape a rail would return. rateScaled is the rate × 10^18,
    // the same scale as Amount, because multiplying a scaled bigint by a binary
    // float reintroduces every problem Amount prevents, one layer up.
    const rateScaled = amt('1.0834');
    expect(typeof rateScaled).toBe('bigint');
    expect(rateScaled).toBe(1_083_400_000_000_000_000n);
  });
});

// ══ RAILMODE CARRIES `absent` ═══════════════════════════════════════════════

describe('RailMode is three-valued, and the third value is not a shade of the second', () => {
  it('has exactly live, sandbox and absent', () => {
    expect([...RAIL_MODES]).toEqual(['live', 'sandbox', 'absent']);
  });

  it('reports an unconfigured chain as ABSENT and a memory chain as SANDBOX', () => {
    expect(cryptoOn(new UnconfiguredChain()).mode).toBe('absent');
    expect(cryptoOn(new MemoryChain()).mode).toBe('sandbox');
  });

  it('NEVER reports either of them as live — the property no widening may weaken', () => {
    // `isLive` is an allow-list of size one, against one string. The tempting
    // refactor is `mode !== 'sandbox'`, which reads the same, passes the same
    // tests today, and promoted `absent` to live the moment the type widened.
    for (const adapter of [cryptoOn(new UnconfiguredChain()), cryptoOn(new MemoryChain()), cardSandbox()]) {
      expect(isLive(adapter)).toBe(false);
    }
  });

  it('tells absent and sandbox apart in both directions', () => {
    const absent = cryptoOn(new UnconfiguredChain());
    const sandbox = cryptoOn(new MemoryChain());

    expect(isAbsent(absent)).toBe(true);
    expect(isSandbox(absent)).toBe(false);
    expect(isAbsent(sandbox)).toBe(false);
    expect(isSandbox(sandbox)).toBe(true);
  });
});

// ══ THE COLLAPSE, AND WHAT IT COST ══════════════════════════════════════════

describe('posture reads three values, and the boot gate stops manufacturing pressure to override it', () => {
  it('lists absent rails separately from sandbox rails', () => {
    const rails = new RailRegistry([cryptoOn(new UnconfiguredChain()), cardSandbox()]);
    const status = railPostureStatus(rails, 'live-only');

    expect(status.absent).toEqual(['crypto-native']);
    expect(status.sandbox).toEqual(['card-sandbox']);
    expect(status.live).toEqual([]);
    expect(status.summary).toMatch(/ABSENT \[crypto-native\]/);
    expect(status.summary).toMatch(/every call refuses/);
  });

  it('leaves the summary of a deployment with no absent rails exactly as it was', () => {
    // Appended, never woven in. An operator who has learned to recognise the old
    // line does not have to relearn it.
    const status = railPostureStatus(new RailRegistry([cardSandbox()]), 'live-only');
    expect(status.absent).toEqual([]);
    expect(status.summary).not.toMatch(/ABSENT/);
  });

  /**
   * THE CONCRETE COST OF THE COLLAPSE, as a test.
   *
   * `defaultChainFor` gives staging/prod an `UnconfiguredChain` when nothing is
   * configured — the DESIGNED production default, and the safe one. Under the
   * collapse that chain made `crypto-native` report `sandbox`, this gate counted
   * it as a sandbox rail, and the process REFUSED TO BOOT. The only way out was
   * `PAY_ALLOW_SANDBOX_RAILS=true` — the flag whose whole meaning is "sandbox
   * rails may move value here". The collapse manufactured pressure to set, in
   * production, the exact override that exists to warn about sandbox rails, in
   * order to start a service with no chain to abuse in the first place.
   */
  it('BOOTS in prod with an absent rail, without anybody setting the sandbox override', () => {
    const rails = new RailRegistry([cryptoOn(new UnconfiguredChain())]);
    const posture = assertRailPosture(rails, { APP_ENV: 'prod' });

    expect(posture.policy).toBe('live-only');
    expect(posture.sandboxOverride).toBe(false);
  });

  it('still refuses to boot in prod when a real SANDBOX rail is registered', () => {
    // The gate is unchanged where it was right. Absent is not a relaxation of
    // it; it is a case that never belonged to it.
    expect(() => assertRailPosture(new RailRegistry([cardSandbox()]), { APP_ENV: 'prod' })).toThrow();
  });
});

// ══ AN ABSENT RAIL IS REFUSED UNDER EVERY POLICY ════════════════════════════

describe('absent refuses everywhere, and by the right name', () => {
  const absent = () => cryptoOn(new UnconfiguredChain());

  it('is refused for payout under live-only, like a sandbox', () => {
    expect(() => assertRailMayMoveValue(absent(), 'payout', 'live-only')).toThrow(SandboxRailRefusal);
  });

  it('is ALSO refused under allow-sandbox, where a sandbox is permitted', () => {
    // `allow-sandbox` is an operator's statement about a SIMULATION: everything
    // here works, none of it is real, everyone it affects is inside the
    // exercise. That statement cannot be made about a rail with nothing behind
    // it — there is no simulation to consent to. Letting it through would move
    // the ledger first and refuse at the rail second, which is a hold posted for
    // a reason that was knowable beforehand.
    expect(() => assertRailMayMoveValue(absent(), 'payout', 'allow-sandbox')).toThrow(SandboxRailRefusal);
    // The contrast, in the same test, so the distinction cannot rot: a sandbox
    // under allow-sandbox is fine, and CI depends on it being fine.
    expect(() => assertRailMayMoveValue(cryptoOn(new MemoryChain()), 'payout', 'allow-sandbox')).not.toThrow();
  });

  it('is refused for operations that are not on the value-leaving list, too', () => {
    // A sandbox `authorize` is allowed under live-only because it moves value IN
    // and nobody has been told their own money left. An absent rail cannot
    // authorize anything at all, so the refusal is not about value direction.
    expect(() => assertRailMayMoveValue(absent(), 'authorize', 'live-only')).toThrow(SandboxRailRefusal);
  });

  it('says NOTHING CONFIGURED, and says there is no flag for it', () => {
    const err = (() => {
      try {
        assertRailMayMoveValue(absent(), 'payout', 'live-only');
        return null;
      } catch (e) {
        return e as SandboxRailRefusal;
      }
    })();

    expect(err!.reason).toBe('absent');
    expect(err!.name).toBe('AbsentRailRefusal');
    // Still `pay.rail_not_live`, because router.ts maps this class to
    // SERVICE_UNAVAILABLE and that mapping is right for both kinds of not-live.
    expect(err!.code).toBe('pay.rail_not_live');

    expect(err!.message).toMatch(/NOTHING CONFIGURED BEHIND IT/);
    expect(err!.message).toMatch(/THERE IS NO FLAG FOR THIS/);
    // Sending an operator to look for a flag when the answer is a sponsor bank
    // costs them a day.
    expect(err!.message).toMatch(/sponsor bank/i);
    expect(err!.message).not.toMatch(/is a SANDBOX/);
  });

  it('keeps saying SANDBOX for a sandbox — the two messages did not merge', () => {
    const err = (() => {
      try {
        assertRailMayMoveValue(cardSandbox(), 'payout', 'live-only');
        return null;
      } catch (e) {
        return e as SandboxRailRefusal;
      }
    })();

    expect(err!.reason).toBe('sandbox');
    expect(err!.name).toBe('SandboxRailRefusal');
    expect(err!.message).toMatch(/is a SANDBOX/);
  });
});

// ══ THE PUBLIC CHECKOUT ═════════════════════════════════════════════════════

describe('the hosted checkout never opens on a rail that cannot complete it', () => {
  it('refuses an absent rail under dev policy too, where a sandbox is legitimate', () => {
    // Dev genuinely wants a payer to be able to complete a checkout against a
    // sandbox. An absent rail cannot complete anything, so opening a session on
    // it hands a payer a page guaranteed to fail.
    const err = (() => {
      try {
        assertRailMayAcceptPublicPayment(cryptoOn(new UnconfiguredChain()), 'allow-sandbox');
        return null;
      } catch (e) {
        return e as PublicCheckoutUnavailable;
      }
    })();

    expect(err).toBeInstanceOf(PublicCheckoutUnavailable);
    expect(err!.reason).toBe('absent');
    expect(() => assertRailMayAcceptPublicPayment(cardSandbox(), 'allow-sandbox')).not.toThrow();
  });

  it('reports `absent` rather than `unhealthy` when selection finds nothing', () => {
    // An absent rail is unhealthy BY CONSTRUCTION. Reporting it as unhealthy
    // sends an operator to check a node's uptime when the node was never bought.
    const rails = new RailRegistry([cryptoOn(new UnconfiguredChain())]);
    const err = (() => {
      try {
        selectPublicCheckoutRail(rails, ['crypto-native'], 'live-only');
        return null;
      } catch (e) {
        return e as PublicCheckoutUnavailable;
      }
    })();

    expect(err!.reason).toBe('absent');
    expect(err!.railId).toBeNull();
  });
});

// ══ THE RESULT VOCABULARY ═══════════════════════════════════════════════════

describe('RailResultStatus grew, and `ok === (status !== ‘failed’)` still holds', () => {
  it('treats a dispute and a reversal as true reports, not failed calls', () => {
    // The call worked. The news is bad. Those are different facts, and an
    // adapter that reported `ok: false` for a dispute would put it in front of
    // every retry policy in the core.
    const disputed: RailResult = {
      ok: true,
      railRef: 'ch_1',
      status: 'disputed',
      amount: amt('100'),
      assetId: 'EUR',
      at: new Date(),
    };
    expect(disputed.ok).toBe(disputed.status !== 'failed');
  });

  it('carries the remaining authorization on a partial capture, as a bigint', () => {
    const partial: RailResult = {
      ok: true,
      railRef: 'ch_1',
      status: 'partially_captured',
      amount: amt('40'),
      assetId: 'EUR',
      at: new Date(),
      remainingAuthorized: amt('60'),
    };
    expect(typeof partial.remainingAuthorized).toBe('bigint');
    // On the result rather than derived, because the rail is the authority: a
    // scheme applying its own over-capture tolerance, or expiring an
    // authorization early, makes the rail's number the true one.
    expect(partial.remainingAuthorized).toBe(amt('60'));
  });

  it('pairs `requires_action` with a next action that carries an expiry', () => {
    const challenge: RailResult = {
      ok: true,
      railRef: 'ch_1',
      status: 'requires_action',
      amount: amt('100'),
      assetId: 'EUR',
      at: new Date(),
      nextAction: { kind: 'redirect', url: 'https://acs.example/3ds', expiresAt: new Date(Date.now() + 600_000) },
    };

    expect(challenge.nextAction).toBeDefined();
    // A challenge with no expiry is a payment that can never be reconciled: the
    // core has nothing to time out against and the row sits in requires_action
    // for ever, holding a merchant's authorization open.
    expect(challenge.nextAction!.expiresAt).toBeInstanceOf(Date);
  });
});
