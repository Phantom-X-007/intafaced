import { describe, expect, it } from 'vitest';
import {
  InMemoryApprovedAlgoParentStore,
  type ApprovedAlgoParent,
  type RetainedAlgoSchedule,
} from './oms-start.js';
import { hedgeRemainingAfterMmpFill } from './oms-mmp-hedge.js';

const leftover = '10';

function retainedTwap(): RetainedAlgoSchedule {
  return { durationMs: 60_000, sliceIntervalMs: 10_000, slicesPlanned: 6, participationBps: null };
}

function parentWithResidual(
  over: Partial<ApprovedAlgoParent> & Pick<ApprovedAlgoParent, 'parentClientOrderId'> = {
    parentClientOrderId: 'parent-mmp',
  },
  remaining = leftover,
): ApprovedAlgoParent {
  return {
    parentClientOrderId: over.parentClientOrderId,
    kind: over.kind ?? 'twap',
    status: over.status ?? 'approved',
    startedAt: over.startedAt ?? null,
    schedule: over.schedule ?? retainedTwap(),
    residual: over.residual ?? { remaining },
    ...over,
  };
}

describe('hedgeRemainingAfterMmpFill', () => {
  it('refuses missing parentClientOrderId', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(parentWithResidual());
    expect(hedgeRemainingAfterMmpFill({ hedgeSize: '3', parentStore })).toMatchObject({
      ok: false,
      reason: 'missing_parent',
    });
    expect(
      hedgeRemainingAfterMmpFill({ parentClientOrderId: '', hedgeSize: '3', parentStore }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(
      hedgeRemainingAfterMmpFill({ parentClientOrderId: '   ', hedgeSize: '3', parentStore }),
    ).toMatchObject({ ok: false, reason: 'missing_parent' });
    expect(parentStore.get('parent-mmp')?.residual?.remaining).toBe(leftover);
  });

  it('refuses null/undefined/whitespace hedgeSize with hedge_size_blank; parent residual still 10', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(parentWithResidual());
    expect(
      hedgeRemainingAfterMmpFill({
        parentClientOrderId: 'parent-mmp',
        hedgeSize: null,
        parentStore,
      }),
    ).toMatchObject({ ok: false, reason: 'hedge_size_blank' });
    expect(
      hedgeRemainingAfterMmpFill({
        parentClientOrderId: 'parent-mmp',
        hedgeSize: undefined,
        parentStore,
      }),
    ).toMatchObject({ ok: false, reason: 'hedge_size_blank' });
    expect(
      hedgeRemainingAfterMmpFill({
        parentClientOrderId: 'parent-mmp',
        hedgeSize: '',
        parentStore,
      }),
    ).toMatchObject({ ok: false, reason: 'hedge_size_blank' });
    expect(
      hedgeRemainingAfterMmpFill({
        parentClientOrderId: 'parent-mmp',
        hedgeSize: '   ',
        parentStore,
      }),
    ).toMatchObject({ ok: false, reason: 'hedge_size_blank' });
    expect(parentStore.get('parent-mmp')?.residual?.remaining).toBe(leftover);
  });

  it("refuses 'nope' with hedge_size_invalid; residual unchanged", () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(parentWithResidual());
    const result = hedgeRemainingAfterMmpFill({
      parentClientOrderId: 'parent-mmp',
      hedgeSize: 'nope',
      parentStore,
    });
    expect(result).toMatchObject({ ok: false, reason: 'hedge_size_invalid' });
    expect(parentStore.get('parent-mmp')?.residual?.remaining).toBe(leftover);
  });

  it("refuses '0' with hedge_size_invalid; residual unchanged", () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(parentWithResidual());
    const result = hedgeRemainingAfterMmpFill({
      parentClientOrderId: 'parent-mmp',
      hedgeSize: '0',
      parentStore,
    });
    expect(result).toMatchObject({ ok: false, reason: 'hedge_size_invalid' });
    expect(parentStore.get('parent-mmp')?.residual?.remaining).toBe(leftover);
  });

  it("with hedgeSize '3' and parent residual '10': ok, hedged, caller size, leftover stays", () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(parentWithResidual());
    const result = hedgeRemainingAfterMmpFill({
      parentClientOrderId: 'parent-mmp',
      hedgeSize: '3',
      parentStore,
    });
    expect(result).toMatchObject({
      ok: true,
      hedged: true,
      parent: { parentClientOrderId: 'parent-mmp' },
      hedgeSize: '3',
      residual: { remaining: leftover },
    });
    if (!result.ok) return;
    expect(result.hedgeSize).toBe('3');
    expect(result.residual.remaining).toBe('10');
    expect(parentStore.get('parent-mmp')?.residual?.remaining).toBe(leftover);
  });

  it('without parentStore: residual.remaining is null (not invented)', () => {
    const result = hedgeRemainingAfterMmpFill({
      parentClientOrderId: 'parent-mmp',
      hedgeSize: '3',
    });
    expect(result).toMatchObject({
      ok: true,
      hedged: true,
      parent: { parentClientOrderId: 'parent-mmp' },
      hedgeSize: '3',
      residual: { remaining: null },
    });
  });

  it('result has no flatten field; parent leftover is not consumed', () => {
    const parentStore = new InMemoryApprovedAlgoParentStore();
    parentStore.seed(parentWithResidual());
    const result = hedgeRemainingAfterMmpFill({
      parentClientOrderId: 'parent-mmp',
      hedgeSize: '3',
      parentStore,
    });
    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty('flatten');
    expect(result).not.toHaveProperty('matching');
    expect(result).not.toHaveProperty('consumed');
    expect(result).not.toHaveProperty('released');
    expect(parentStore.get('parent-mmp')?.residual?.remaining).toBe(leftover);
    expect(parentStore.get('parent-mmp')?.residual?.released).toBeUndefined();
  });
});
