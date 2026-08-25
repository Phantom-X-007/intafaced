import { describe, expect, it } from 'vitest';
import {
  CodController,
  computeExpiryMs,
  decideArm,
  firedFrame,
  leaseRangeFromEnv,
  parseCodCommand,
  targetsFromCancel,
  wouldInventCodMassSuccess,
  wouldInventCodMassSuccessFrame,
  type CodArmCommand,
  type CodLease,
  type TradeCancelPort,
} from './cod.js';

const RANGE = { minTtlMs: 1_000, maxTtlMs: 60_000 };

function arm(over: Partial<CodArmCommand> = {}): CodArmCommand {
  return {
    commandId: 'cmd-1',
    ttlMs: 5_000,
    scope: 'account',
    excludedOrderClasses: [],
    ...over,
  };
}

describe('COD lease clock', () => {
  it('expiry is server receipt + ttl — client expiresAt is not an input', () => {
    expect(computeExpiryMs(1_000_000, 5_000)).toBe(1_005_000);
    const parsed = parseCodCommand({
      type: 'cod.arm',
      commandId: 'cmd-1',
      ttlMs: 5_000,
      scope: 'account',
      expiresAt: '1999-01-01T00:00:00.000Z',
      clientNow: 0,
    });
    expect(parsed.kind).toBe('arm');
    if (parsed.kind !== 'arm') return;
    const decided = decideArm({
      command: parsed.command,
      range: RANGE,
      nowMs: 2_000_000,
      hasWrite: true,
      cancelPortAttached: true,
    });
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.lease.receivedAtMs).toBe(2_000_000);
    expect(decided.lease.expiresAtMs).toBe(2_005_000);
  });

  it('renew uses a new server now, not a client-supplied expiry', () => {
    const first = computeExpiryMs(10_000, 5_000);
    const renewed = computeExpiryMs(12_000, 5_000);
    expect(renewed).toBe(17_000);
    expect(renewed).not.toBe(first);
  });
});

describe('COD arm policy', () => {
  it('refuses when owner lease range is blank', () => {
    expect(leaseRangeFromEnv(undefined, 60_000)).toBeNull();
    expect(decideArm({ command: arm(), range: null, nowMs: 1, hasWrite: true, cancelPortAttached: true })).toEqual({
      ok: false,
      code: 'cod.lease_range_unconfigured',
    });
  });

  it('refuses trade:read-only and excluded classes (owner socket)', () => {
    expect(decideArm({ command: arm(), range: RANGE, nowMs: 1, hasWrite: false, cancelPortAttached: true }).code).toBe(
      'cod.write_required',
    );
    expect(
      decideArm({
        command: arm({ excludedOrderClasses: ['iceberg'] }),
        range: RANGE,
        nowMs: 1,
        hasWrite: true,
        cancelPortAttached: true,
      }).code,
    ).toBe('cod.excluded_classes_unconfigured');
  });

  it('session scope arms but is not cancel-executable', () => {
    const decided = decideArm({
      command: arm({ scope: 'session' }),
      range: RANGE,
      nowMs: 1,
      hasWrite: true,
      cancelPortAttached: true,
    });
    expect(decided.ok).toBe(true);
    if (!decided.ok) return;
    expect(decided.lease.cancelExecutable).toBe(false);
  });

  it('ttl outside owner range refuses', () => {
    expect(decideArm({ command: arm({ ttlMs: 50 }), range: RANGE, nowMs: 1, hasWrite: true, cancelPortAttached: true }).code).toBe(
      'cod.ttl_out_of_range',
    );
  });
});

describe('COD fire honesty', () => {
  const lease: CodLease = {
    commandId: 'cmd-1',
    userId: 'user-a',
    accessToken: 't',
    receivedAtMs: 1,
    expiresAtMs: 2,
    ttlMs: 1,
    scope: 'account',
    cancelExecutable: true,
    fired: true,
  };

  it('session fire is UNKNOWN and not complete', () => {
    const mapped = targetsFromCancel({ scope: 'session', result: { reached: true, status: 200, orders: [{ orderId: 'o1' }] } });
    expect(mapped.tradeReached).toBe(false);
    expect(mapped.complete).toBe(false);
    expect(mapped.targets[0]?.outcome).toBe('OUTCOME_UNKNOWN');
    expect(mapped.targets[0]?.reason).toBe('cod.session_scope_not_mapped');
  });

  it('unreachable trade is UNKNOWN — never mass APPLIED', () => {
    const mapped = targetsFromCancel({ scope: 'account', result: { reached: false, reason: 'cod.trade_not_reached' } });
    expect(mapped.tradeReached).toBe(false);
    expect(mapped.complete).toBe(false);
    expect(mapped.targets.every((t) => t.outcome !== 'APPLIED')).toBe(true);
    const frame = firedFrame({
      lease,
      activation: 'disconnect',
      firedAtMs: 3,
      ...mapped,
    });
    expect(wouldInventCodMassSuccessFrame(frame)).toBe(false);
    expect(wouldInventCodMassSuccess({ channel: 'cod', type: 'cod.fired', complete: true, tradeReached: false })).toBe(true);
  });

  it('trade 200 with cancelled ids is APPLIED per target', () => {
    const mapped = targetsFromCancel({
      scope: 'account',
      result: { reached: true, status: 200, orders: [{ orderId: 'o1' }, { orderId: 'o2' }] },
    });
    expect(mapped).toEqual({
      tradeReached: true,
      complete: true,
      targets: [
        { selector: 'o1', outcome: 'APPLIED' },
        { selector: 'o2', outcome: 'APPLIED' },
      ],
    });
  });

  it('does not treat a reconnect empty blotter as COD mass-success', () => {
    expect(wouldInventCodMassSuccess({ channel: 'orders', type: 'snapshot', orders: [], userId: 'u' })).toBe(false);
    expect(wouldInventCodMassSuccess({ channel: 'orders', type: 'snapshot', orders: [], codComplete: true })).toBe(true);
  });
});

describe('parseCodCommand', () => {
  it('ignores non-COD and treats heartbeat as renew', () => {
    expect(parseCodCommand({ op: 'subscribe' }).kind).toBe('ignore');
    expect(parseCodCommand({ type: 'cod.heartbeat', commandId: 'h1' })).toEqual({ kind: 'renew', commandId: 'h1' });
  });
});

describe('CodController', () => {
  it('lease expiry uses the server schedule, not a client clock, and does not invent cancels', async () => {
    let nowMs = 1_000;
    const scheduled: Array<{ fn: () => void; delay: number; cancelled: boolean }> = [];
    const cancelCalls: unknown[] = [];
    const cancel: TradeCancelPort = {
      async cancelAll(input) {
        cancelCalls.push(input);
        return { reached: true, status: 200, orders: [{ orderId: 'should-not-run' }] };
      },
    };
    const frames: string[] = [];
    const conn = {};
    const controller = new CodController({
      range: RANGE,
      now: () => nowMs,
      schedule: (fn, delay) => {
        const item = { fn, delay, cancelled: false };
        scheduled.push(item);
        return () => {
          item.cancelled = true;
        };
      },
      cancel,
    });
    controller.handleText(
      conn,
      JSON.stringify({
        type: 'cod.arm',
        commandId: 'c1',
        ttlMs: 5_000,
        scope: 'session',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }),
      { userId: 'user-a', accessToken: 'tok', hasWrite: true, send: (f) => frames.push(f) },
    );
    expect(JSON.parse(frames[0]!).type).toBe('cod.armed');
    expect(JSON.parse(frames[0]!).expiresAt).toBe(new Date(6_000).toISOString());
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.delay).toBe(5_000);

    nowMs = 1_500;
    controller.handleText(conn, JSON.stringify({ type: 'cod.renew', commandId: 'c2' }), {
      userId: 'user-a',
      accessToken: 'tok',
      hasWrite: true,
      send: (f) => frames.push(f),
    });
    expect(JSON.parse(frames[1]!).type).toBe('cod.renewed');
    expect(JSON.parse(frames[1]!).expiresAt).toBe(new Date(6_500).toISOString());
    expect(scheduled[0]!.cancelled).toBe(true);
    expect(scheduled[1]!.delay).toBe(5_000);

    nowMs = 6_500;
    scheduled[1]!.fn();
    await new Promise((r) => setTimeout(r, 0));
    const fired = frames
      .map((f) => JSON.parse(f) as { type: string; tradeReached?: boolean; complete?: boolean; targets?: unknown })
      .find((f) => f.type === 'cod.fired');
    expect(fired).toMatchObject({
      type: 'cod.fired',
      activation: 'lease_expired',
      tradeReached: false,
      complete: false,
    });
    expect(cancelCalls).toEqual([]);
    expect(wouldInventCodMassSuccess(fired)).toBe(false);
  });
});
