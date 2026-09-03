import { describe, expect, it } from 'vitest';
import { parseAmount } from '@intafaced/ledger-client/money';
import { MemoryEventBus } from '@intafaced/events';
import { MatchingEngine } from './engine.js';
import { MemoryJournal } from './journal.js';
import type { EngineOrder, EngineSurveillanceCase, OrderSide } from './types.js';
import { AUTO_CLOSE_FORBIDDEN, closeSurveillanceCase } from './surveillance-case.js';
import {
  AUTO_ADJUDICATE_FORBIDDEN,
  DETECTOR_GAP,
  adjudicateSurveillanceCase,
  detectorGap,
  installSurveillancePersist,
  layeringThresholdUnset,
  recordOpenSurveillanceCase,
  runDetector,
  spoofingThresholdUnset,
  type AdjudicateRefuse,
  type DetectorRefuse,
  type DetectorStatus,
} from './surveillance-persist.js';

installSurveillancePersist();

/**
 * CARD G-surveillance hitch. Persist open cases.
 * Spoofing/layering refuse auto-adjudicate. Unset thresholds are detector_gap, never 0.
 */

const MARKET = 'BTC/USDT';
const OWN = '11111111-1111-4111-8111-111111111111';
const TAKE = '22222222-2222-4222-8222-222222222222';

type PersistEngine = MatchingEngine & {
  adjudicateSurveillanceCase(cmd: { readonly reason?: string | null }): AdjudicateRefuse;
  detectorStatus(reason: string): DetectorStatus;
  runDetector(reason: string): DetectorRefuse;
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

function spoofingCase(): EngineSurveillanceCase {
  return { accountId: 'desk', marketId: MARKET, reason: 'spoofing', status: 'open' };
}

function layeringCase(): EngineSurveillanceCase {
  return { accountId: 'desk', marketId: MARKET, reason: 'layering', status: 'open' };
}

describe('surveillance persist — open cases survive recover; no auto-adjudicate; detector_gap', () => {
  it('named spoofing case persists across recover wrap', () => {
    const { engine } = build();
    const opened = recordOpenSurveillanceCase(engine, {
      accountId: 'desk',
      marketId: MARKET,
      reason: 'spoofing',
    });
    expect(opened).toEqual({ ok: true, case: spoofingCase() });
    expect(engine.openSurveillanceCases()).toEqual([spoofingCase()]);

    engine.recover();

    const persisted = engine.openSurveillanceCases();
    expect(persisted).toEqual([spoofingCase()]);
    expect(persisted[0]!.status).toBe('open');
    expect(persisted[0]).not.toHaveProperty('closed');
  });

  it('spoofing/layering stay open; adjudicate refuses auto_adjudicate_forbidden', () => {
    const { engine } = build();
    recordOpenSurveillanceCase(engine, { accountId: 'desk', marketId: MARKET, reason: 'spoofing' });
    recordOpenSurveillanceCase(engine, { accountId: 'desk', marketId: MARKET, reason: 'layering' });

    const spoof = engine.adjudicateSurveillanceCase({ reason: 'spoofing' });
    const layer = engine.adjudicateSurveillanceCase({ reason: 'layering' });
    const self = engine.adjudicateSurveillanceCase({ reason: 'self_trade' });
    const direct = adjudicateSurveillanceCase({ reason: 'spoofing' });

    expect(spoof).toMatchObject({ ok: false, code: AUTO_ADJUDICATE_FORBIDDEN });
    expect(layer).toMatchObject({ ok: false, code: AUTO_ADJUDICATE_FORBIDDEN });
    expect(self).toMatchObject({ ok: false, code: AUTO_ADJUDICATE_FORBIDDEN });
    expect(direct).toMatchObject({ ok: false, code: AUTO_ADJUDICATE_FORBIDDEN });

    const open = engine.openSurveillanceCases();
    expect(open).toEqual([layeringCase(), spoofingCase()]);
    expect(open.every((row) => row.status === 'open')).toBe(true);
  });

  it('detectorStatus spoofing is disabled detector_gap with threshold null not 0; runDetector invents no case', () => {
    const { engine } = build();
    expect(spoofingThresholdUnset()).toBe(true);
    expect(layeringThresholdUnset()).toBe(true);

    const status = engine.detectorStatus('spoofing');
    const direct = detectorGap('spoofing');
    expect(status.enabled).toBe(false);
    expect(status.gap).toBe(DETECTOR_GAP);
    expect(status.threshold).toBeNull();
    expect(status.threshold).not.toBe(0);
    expect(direct.enabled).toBe(false);
    expect(direct.gap).toBe(DETECTOR_GAP);
    expect(direct.threshold).toBeNull();
    expect(direct.threshold).not.toBe(0);
    expect('threshold' in status && status.threshold === 0).toBe(false);

    const ran = engine.runDetector('spoofing');
    const ranDirect = runDetector('layering');
    expect(ran.ok).toBe(false);
    expect(ran.code).toBe(DETECTOR_GAP);
    expect(ran.gap).toBe(DETECTOR_GAP);
    expect(ran.threshold).toBeNull();
    expect(ran.threshold).not.toBe(0);
    expect('case' in ran).toBe(false);
    expect(ranDirect.ok).toBe(false);
    expect(ranDirect.code).toBe(DETECTOR_GAP);
    expect('case' in ranDirect).toBe(false);
    expect(engine.openSurveillanceCases()).toEqual([]);
  });

  it('self_trade mill still opens; closeSurveillanceCase still auto_close_forbidden', async () => {
    const { engine } = build();
    await engine.submit(MARKET, order({ id: OWN, account: 'same', side: 'buy', qty: '1', price: '100' }));
    const take = await engine.submit(MARKET, order({ id: TAKE, account: 'same', side: 'sell', qty: '1', price: '100' }));

    const named: EngineSurveillanceCase = {
      accountId: 'same',
      marketId: MARKET,
      reason: 'self_trade',
      status: 'open',
    };
    expect(take.accepted).toBe(true);
    expect(take.surveillanceCases).toEqual([named]);
    expect(engine.openSurveillanceCases()).toEqual([named]);
    expect(engine.openSurveillanceCases()).toHaveLength(1);

    engine.recover();
    expect(engine.openSurveillanceCases()).toEqual([named]);

    expect(closeSurveillanceCase()).toMatchObject({ ok: false, code: AUTO_CLOSE_FORBIDDEN });
    expect(engine.openSurveillanceCases()[0]!.status).toBe('open');
  });

  it('no MATCHING_SURVEILLANCE_ env invented', () => {
    expect(spoofingThresholdUnset()).toBe(true);
    expect(layeringThresholdUnset()).toBe(true);
    expect(Object.keys(process.env).filter((key) => key.startsWith('MATCHING_SURVEILLANCE_'))).toEqual([]);
  });
});
