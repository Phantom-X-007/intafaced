import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { MemoryJournal } from './journal.js';
import type { EngineOrder, EngineSurveillanceCase, OrderSide } from './types.js';
import { AUTO_CLOSE_FORBIDDEN, closeSurveillanceCase, type OpenSurveillanceCaseResult, type SurveillanceRefuse } from './surveillance-case.js';
import {
  AUTO_ADJUDICATE_FORBIDDEN,
  DETECTOR_GAP,
  adjudicateSurveillanceCase,
  detectorGap,
  installSurveillancePersist,
  layeringThresholdUnset,
  runDetector,
  spoofingThresholdUnset,
  type AdjudicateRefuse,
  type DetectorRunRefuse,
  type DetectorStatus,
  type OpenSurveillanceCaseInput,
} from './surveillance-persist.js';

installSurveillancePersist();

/**
 * CARD G-surveillance hitch. Persist open cases.
 * Spoofing/layering stay named open evidence. Missing thresholds are a detector gap — never 0.
 */

const MARKET = 'BTC/USDT';
const ASK = '11111111-1111-4111-8111-111111111111';
const TAKE = '22222222-2222-4222-8222-222222222222';
const SECOND = '33333333-3333-4333-8333-333333333333';
const FRESH = '44444444-4444-4444-8444-444444444444';

type PersistEngine = MatchingEngine & {
  openSurveillanceCase(input: OpenSurveillanceCaseInput): OpenSurveillanceCaseResult;
  adjudicateSurveillanceCase(input?: { readonly reason?: string | null }): AdjudicateRefuse;
  detectorStatus(reason: string): DetectorStatus;
  runDetector(reason: string, ...args: unknown[]): DetectorRunRefuse;
  closeSurveillanceCase(): SurveillanceRefuse;
};

function order(spec: { id: string; account?: string; side: OrderSide; qty: string; price: string }): EngineOrder {
  return {
    orderId: spec.id,
    accountId: spec.account ?? 'desk',
    type: 'limit',
    side: spec.side,
    qty: parseAmount(spec.qty),
    price: parseAmount(spec.price),
    stopPrice: null,
    tif: 'GTC',
  };
}

function build() {
  const journal = new MemoryJournal();
  const bus = new MemoryEventBus('svc-matching');
  const engine = new MatchingEngine({ journal, bus, snapshotEvery: 0 }) as PersistEngine;
  return { journal, bus, engine };
}

function spoofingOf(cases: readonly EngineSurveillanceCase[]): EngineSurveillanceCase | undefined {
  return cases.find((row) => row.reason === 'spoofing' && row.status === 'open');
}

describe('surveillance persist — open evidence, no auto-adjudicate, detector gap', () => {
  it('named spoofing persists across recover wrap and a second submit', async () => {
    const { engine } = build();
    const opened = engine.openSurveillanceCase({ accountId: 'desk', marketId: MARKET, reason: 'spoofing' });
    expect(opened.ok).toBe(true);
    expect(spoofingOf(engine.openSurveillanceCases())).toEqual({
      accountId: 'desk',
      marketId: MARKET,
      reason: 'spoofing',
      status: 'open',
    });

    engine.recover();
    const second = await engine.submit(MARKET, order({ id: SECOND, side: 'buy', qty: '1', price: '99' }));
    expect(second.accepted).toBe(true);
    expect(spoofingOf(engine.openSurveillanceCases())).toEqual({
      accountId: 'desk',
      marketId: MARKET,
      reason: 'spoofing',
      status: 'open',
    });
  });

  it('spoofing and layering stay open; adjudicate refuses auto_adjudicate_forbidden', () => {
    const { engine } = build();
    expect(engine.openSurveillanceCase({ accountId: 'desk', marketId: MARKET, reason: 'spoofing' }).ok).toBe(true);
    expect(engine.openSurveillanceCase({ accountId: 'desk', marketId: MARKET, reason: 'layering' }).ok).toBe(true);

    const spoofAdj = engine.adjudicateSurveillanceCase({ reason: 'spoofing' });
    const layerAdj = engine.adjudicateSurveillanceCase({ reason: 'layering' });
    const selfAdj = adjudicateSurveillanceCase({ reason: 'self_trade' });
    expect(spoofAdj).toMatchObject({ ok: false, code: AUTO_ADJUDICATE_FORBIDDEN });
    expect(layerAdj).toMatchObject({ ok: false, code: AUTO_ADJUDICATE_FORBIDDEN });
    expect(selfAdj).toMatchObject({ ok: false, code: AUTO_ADJUDICATE_FORBIDDEN });

    const listed = engine.openSurveillanceCases();
    expect(listed).toEqual(
      expect.arrayContaining([
        { accountId: 'desk', marketId: MARKET, reason: 'spoofing', status: 'open' },
        { accountId: 'desk', marketId: MARKET, reason: 'layering', status: 'open' },
      ]),
    );
    expect(listed.every((row) => row.status === 'open')).toBe(true);
  });

  it('missing thresholds disable the detector with detector_gap; threshold is null not 0', () => {
    const { engine } = build();
    expect(spoofingThresholdUnset()).toBe(true);
    expect(layeringThresholdUnset()).toBe(true);

    const status = engine.detectorStatus('spoofing');
    expect(status.enabled).toBe(false);
    expect(status.gap).toBe(DETECTOR_GAP);
    expect(status.threshold).toBeNull();
    expect(status.threshold).not.toBe(0);
    expect(detectorGap('layering')).toEqual({
      enabled: false,
      gap: DETECTOR_GAP,
      reason: 'layering',
      threshold: null,
    });

    const before = engine.openSurveillanceCases();
    const ran = engine.runDetector('spoofing');
    expect(ran.ok).toBe(false);
    expect(ran.code).toBe(DETECTOR_GAP);
    expect(ran.enabled).toBe(false);
    expect(ran.threshold).toBeNull();
    expect('case' in ran).toBe(false);
    expect(engine.openSurveillanceCases()).toEqual(before);
    expect(runDetector('layering')).toMatchObject({ ok: false, code: DETECTOR_GAP, threshold: null });
  });

  it('self_trade STP mill still opens; close remains auto_close_forbidden', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: ASK, account: 'same', side: 'sell', qty: '1', price: '100' }));
    const taken = await engine.submit(MARKET, order({ id: TAKE, account: 'same', side: 'buy', qty: '1', price: '100' }));
    expect(taken.accepted).toBe(true);
    expect(taken.surveillanceCases).toEqual([{ accountId: 'same', marketId: MARKET, reason: 'self_trade', status: 'open' }]);
    expect(engine.openSurveillanceCases()).toEqual([{ accountId: 'same', marketId: MARKET, reason: 'self_trade', status: 'open' }]);
    expect(closeSurveillanceCase()).toMatchObject({ ok: false, code: AUTO_CLOSE_FORBIDDEN });
    expect(engine.closeSurveillanceCase()).toMatchObject({ ok: false, code: AUTO_CLOSE_FORBIDDEN });
    expect(engine.openSurveillanceCases()[0]?.status).toBe('open');
  });

  it('STP self_trade persists on a fresh recover path after a second submit', async () => {
    const { journal, engine } = build();
    await engine.submit(MARKET, order({ id: ASK, account: 'same', side: 'sell', qty: '1', price: '100' }));
    await engine.submit(MARKET, order({ id: TAKE, account: 'same', side: 'buy', qty: '1', price: '100' }));
    expect(engine.openSurveillanceCases()).toEqual([{ accountId: 'same', marketId: MARKET, reason: 'self_trade', status: 'open' }]);

    const recovered = new MatchingEngine({
      journal,
      bus: new MemoryEventBus('svc-matching'),
      snapshotEvery: 0,
    }) as PersistEngine;
    recovered.recover();
    const second = await recovered.submit(MARKET, order({ id: FRESH, account: 'other', side: 'buy', qty: '1', price: '90' }));
    expect(second.accepted).toBe(true);
    expect(recovered.openSurveillanceCases()).toEqual([{ accountId: 'same', marketId: MARKET, reason: 'self_trade', status: 'open' }]);
  });

  it('no MATCHING_SURVEILLANCE_ env invented', () => {
    expect(spoofingThresholdUnset()).toBe(true);
    expect(layeringThresholdUnset()).toBe(true);
    expect(Object.keys(process.env).filter((key) => key.startsWith('MATCHING_SURVEILLANCE_'))).toEqual([]);
  });
});
