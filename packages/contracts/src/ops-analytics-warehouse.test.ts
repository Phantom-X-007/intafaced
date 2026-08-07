import { describe, expect, it } from 'vitest';
import {
  WAREHOUSE_REPLICA_PLAN_V0,
  assertAnalyticsReplicaRole,
  listWarehouseReplicaSources,
  queryWarehouseSurface,
  validateAnalyticsReplicaEndpoint,
  warehouseSurfaceStatusLine,
} from './ops-analytics-warehouse.js';

describe('analytics Stage-1 — warehouse replica + empty surface', () => {
  it('documents ledger, trade, identity as replica sources', () => {
    expect(listWarehouseReplicaSources()).toEqual(['ledger', 'trade', 'identity']);
    expect(WAREHOUSE_REPLICA_PLAN_V0.forbidWriterOnPrimary).toBe(true);
    expect(WAREHOUSE_REPLICA_PLAN_V0.liveMaxLagSeconds).toBe(60);
  });

  it('accepts read-only replica usernames', () => {
    expect(assertAnalyticsReplicaRole('postgres://analytics_ro:x@localhost:5433/wh', 'readonly')).toEqual({
      ok: true,
      username: 'analytics_ro',
    });
    expect(assertAnalyticsReplicaRole('postgres://svc_ledger_ro:x@localhost:5433/wh', 'readonly').ok).toBe(true);
  });

  it('refuses writer / primary credentials on analytics path', () => {
    expect(assertAnalyticsReplicaRole('postgres://svc_ledger:x@localhost:5433/intafaced', 'readonly').ok).toBe(false);
    expect(assertAnalyticsReplicaRole('postgres://intafaced_ops:x@localhost:5433/intafaced', 'readonly').ok).toBe(false);
    expect(assertAnalyticsReplicaRole('postgres://analytics_ro:x@localhost:5433/wh', 'readwrite').ok).toBe(false);
  });

  it('validateAnalyticsReplicaEndpoint enforces role + url shape', () => {
    const ok = validateAnalyticsReplicaEndpoint({
      source: 'ledger',
      url: 'postgres://replica_ro:secret@replica.internal:5432/ledger',
      role: 'readonly',
      lagSeconds: 12,
    });
    expect(ok.ok).toBe(true);

    const bad = validateAnalyticsReplicaEndpoint({
      source: 'ledger',
      url: 'postgres://svc_trade:secret@primary:5432/trade',
      role: 'readonly',
    });
    expect(bad.ok).toBe(false);
  });

  it('unconfigured replica → unavailable (never invent volume)', () => {
    const r = queryWarehouseSurface({ replicaConfigured: false, lagSeconds: 0, facts: [] });
    expect(r).toEqual({
      status: 'unavailable',
      reason: 'replica_unconfigured',
      freshness: 'unknown',
      mayLabelLive: false,
    });
    expect(warehouseSurfaceStatusLine(r)).toContain('live=0');
  });

  it('unknown lag → unavailable, never live', () => {
    const r = queryWarehouseSurface({ replicaConfigured: true, lagSeconds: null, facts: [] });
    expect(r.status).toBe('unavailable');
    if (r.status !== 'unavailable') return;
    expect(r.reason).toBe('lag_unknown');
    expect(r.mayLabelLive).toBe(false);
  });

  it('stale lag → unavailable', () => {
    const r = queryWarehouseSurface({ replicaConfigured: true, lagSeconds: 120, facts: [] });
    expect(r).toMatchObject({ status: 'unavailable', reason: 'lag_stale', freshness: 'stale', mayLabelLive: false });
  });

  it('configured + fresh lag + no facts → honest empty (not invented KPIs)', () => {
    const r = queryWarehouseSurface({ replicaConfigured: true, lagSeconds: 5, facts: [] });
    expect(r).toEqual({
      status: 'empty',
      reason: 'no_facts',
      freshness: 'live',
      mayLabelLive: false,
    });
  });

  it('fixture facts → ok points with freshness; money stays decimal string', () => {
    const r = queryWarehouseSurface({
      replicaConfigured: true,
      lagSeconds: 10,
      facts: [
        { metricId: 'ledger.postings.count', value: '4' },
        { metricId: 'ledger.volume.notional', value: '250.25' },
      ],
    });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.mayLabelLive).toBe(true);
    expect(r.points.find((p) => p.metricId === 'ledger.volume.notional')!.value).toBe('250.25');
    expect(warehouseSurfaceStatusLine(r)).toMatch(/status=ok points=2/);
  });

  it('refuses money as JS number — no float warehouse close-enough', () => {
    const r = queryWarehouseSurface({
      replicaConfigured: true,
      lagSeconds: 5,
      facts: [{ metricId: 'ledger.volume.notional', value: 99 as unknown as string }],
    });
    expect(r.status).toBe('refuse');
  });
});
