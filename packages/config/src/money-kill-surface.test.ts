import { describe, expect, it } from 'vitest';
import {
  MODULES,
  MODULE_IDS,
  MONEY_PUBLIC_DOORS,
  assertCustodialMoneyKillsComplete,
  edgeKillableMoneyModules,
  moneyKillControlFor,
} from './index.js';

describe('money kill surface (D26-P2-10)', () => {
  it('lists at least one public door per live edge money module', () => {
    for (const module of edgeKillableMoneyModules()) {
      const doors = MONEY_PUBLIC_DOORS.filter((d) => d.module === module);
      expect(doors.length, `${module} must have a named money door`).toBeGreaterThan(0);
    }
  });

  it('every door path is under /api/ and uses a commitment method', () => {
    for (const door of MONEY_PUBLIC_DOORS) {
      expect(door.path.startsWith('/api/'), door.id).toBe(true);
      expect(['POST', 'PUT', 'PATCH', 'DELETE']).toContain(door.method);
      expect(door.what.length, door.id).toBeGreaterThan(8);
    }
  });

  it('door ids are unique', () => {
    const ids = MONEY_PUBLIC_DOORS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every custodial module has an honest kill control — never silent', () => {
    expect(assertCustodialMoneyKillsComplete()).toEqual([]);
    for (const id of MODULE_IDS) {
      if (!MODULES[id].custodial) continue;
      const control = moneyKillControlFor(id);
      expect(control.kind, id).toBeTruthy();
    }
  });

  it('ledger is freeze-only — never a pretend module kill', () => {
    expect(moneyKillControlFor('ledger')).toEqual({
      kind: 'ledger-freeze',
      surface: '/admin/ledger/freeze',
    });
  });

  it('matching is halted by killing trade, not by a fake matching module flag', () => {
    expect(moneyKillControlFor('matching')).toMatchObject({
      kind: 'via-sibling',
      haltVia: 'trade',
    });
  });

  it('live money modules use the shared edge kill surface', () => {
    for (const module of ['trade', 'pay', 'bank', 'p2p', 'token', 'market'] as const) {
      expect(moneyKillControlFor(module)).toEqual({ kind: 'edge-module', module });
    }
  });
});
