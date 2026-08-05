import { describe, expect, it } from 'vitest';
import { AmbassadorProgrammeError, assertFreezeReason, badgeOf, MemoryAmbassadorProgramme, type AmbassadorRecord } from './programme.js';

const base = (overrides: Partial<AmbassadorRecord> = {}): AmbassadorRecord => ({
  userId: '11111111-1111-4111-8111-111111111111',
  status: 'active',
  appointedBy: '22222222-2222-4222-8222-222222222222',
  appointedAt: new Date('2026-08-01T00:00:00Z'),
  frozenAt: null,
  frozenBy: null,
  freezeReason: null,
  ...overrides,
});

describe('badgeOf — public label', () => {
  it('is not ambassador when no row', () => {
    expect(badgeOf('u', null)).toEqual({ userId: 'u', isAmbassador: false, status: null });
  });

  it('isAmbassador only when active', () => {
    expect(badgeOf('u', base()).isAmbassador).toBe(true);
    expect(badgeOf('u', base({ status: 'frozen', frozenAt: new Date(), frozenBy: 'op', freezeReason: 'pause' })).isAmbassador).toBe(false);
  });
});

describe('assertFreezeReason', () => {
  it('trims and accepts a named reason', () => {
    expect(assertFreezeReason('  policy breach  ')).toBe('policy breach');
  });

  it('refuses empty / short reasons', () => {
    expect(() => assertFreezeReason('  x  ')).toThrow(AmbassadorProgrammeError);
    expect(() => assertFreezeReason('')).toThrow(AmbassadorProgrammeError);
  });
});

describe('MemoryAmbassadorProgramme L3 (no pay)', () => {
  it('appoint → freeze → unfreeze; badge tracks active only', () => {
    const desk = new MemoryAmbassadorProgramme();
    const u = '11111111-1111-4111-8111-111111111111';
    const op = '22222222-2222-4222-8222-222222222222';
    desk.appoint({ userId: u, appointedBy: op, now: new Date('2026-08-05T00:00:00Z') });
    expect(desk.badge(u).isAmbassador).toBe(true);
    desk.freeze({ userId: u, frozenBy: op, reason: 'policy hold' });
    expect(desk.badge(u).isAmbassador).toBe(false);
    expect(desk.list('frozen')).toHaveLength(1);
    desk.unfreeze({ userId: u });
    expect(desk.badge(u).isAmbassador).toBe(true);
    expect(() => desk.appoint({ userId: u, appointedBy: op })).toThrow(AmbassadorProgrammeError);
  });

  it('L3 badgesOf + activeCount without invent', () => {
    const desk = new MemoryAmbassadorProgramme();
    const u = '11111111-1111-4111-8111-111111111111';
    const op = '22222222-2222-4222-8222-222222222222';
    desk.appoint({ userId: u, appointedBy: op });
    const badges = desk.badgesOf([u, '33333333-3333-4333-8333-333333333333']);
    expect(badges[0]!.isAmbassador).toBe(true);
    expect(badges[1]!.isAmbassador).toBe(false);
    expect(desk.activeCount()).toBe(1);
  });

  it('L3 statusHistogram counts only stored rows', () => {
    const desk = new MemoryAmbassadorProgramme();
    const u1 = '11111111-1111-4111-8111-111111111111';
    const u2 = '33333333-3333-4333-8333-333333333333';
    const op = '22222222-2222-4222-8222-222222222222';
    expect(desk.statusHistogram()).toEqual({ active: 0, frozen: 0, total: 0 });
    desk.appoint({ userId: u1, appointedBy: op });
    desk.appoint({ userId: u2, appointedBy: op });
    desk.freeze({ userId: u2, frozenBy: op, reason: 'hold' });
    expect(desk.statusHistogram()).toEqual({ active: 1, frozen: 1, total: 2 });
  });

  it('L3 listActiveUserIds sorted without invent', () => {
    const desk = new MemoryAmbassadorProgramme();
    const u1 = '11111111-1111-4111-8111-111111111111';
    const u2 = '33333333-3333-4333-8333-333333333333';
    const op = '22222222-2222-4222-8222-222222222222';
    expect(desk.listActiveUserIds()).toEqual([]);
    desk.appoint({ userId: u2, appointedBy: op });
    desk.appoint({ userId: u1, appointedBy: op });
    expect(desk.listActiveUserIds()).toEqual([u1, u2]);
  });

  it('L3 frozenUserIds + freezeReasonOf without invent', () => {
    const desk = new MemoryAmbassadorProgramme();
    const u1 = '11111111-1111-4111-8111-111111111111';
    const u2 = '33333333-3333-4333-8333-333333333333';
    const op = '22222222-2222-4222-8222-222222222222';
    expect(desk.frozenUserIds()).toEqual([]);
    expect(desk.freezeReasonOf(u1)).toBeNull();
    desk.appoint({ userId: u1, appointedBy: op });
    desk.appoint({ userId: u2, appointedBy: op });
    desk.freeze({ userId: u2, frozenBy: op, reason: 'policy hold' });
    expect(desk.frozenUserIds()).toEqual([u2]);
    expect(desk.freezeReasonOf(u2)).toBe('policy hold');
    expect(desk.freezeReasonOf(u1)).toBeNull();
  });

  it('L3 wave10 isActiveAmbassador + appointingOperators', () => {
    const desk = new MemoryAmbassadorProgramme();
    const u1 = '11111111-1111-4111-8111-111111111111';
    const u2 = '33333333-3333-4333-8333-333333333333';
    const opA = '22222222-2222-4222-8222-222222222222';
    const opB = '44444444-4444-4444-8444-444444444444';
    expect(desk.isActiveAmbassador(u1)).toBe(false);
    desk.appoint({ userId: u1, appointedBy: opB });
    desk.appoint({ userId: u2, appointedBy: opA });
    expect(desk.isActiveAmbassador(u1)).toBe(true);
    desk.freeze({ userId: u1, frozenBy: opB, reason: 'pause' });
    expect(desk.isActiveAmbassador(u1)).toBe(false);
    expect(desk.appointingOperators()).toEqual([opA, opB]);
  });

  it('L3 listFrozenUserIds sorted without invent', () => {
    const desk = new MemoryAmbassadorProgramme();
    const u1 = '11111111-1111-4111-8111-111111111111';
    const u2 = '33333333-3333-4333-8333-333333333333';
    const op = '22222222-2222-4222-8222-222222222222';
    expect(desk.listFrozenUserIds()).toEqual([]);
    desk.appoint({ userId: u2, appointedBy: op });
    desk.appoint({ userId: u1, appointedBy: op });
    desk.freeze({ userId: u2, frozenBy: op, reason: 'hold' });
    desk.freeze({ userId: u1, frozenBy: op, reason: 'hold' });
    expect(desk.listFrozenUserIds()).toEqual([u1, u2]);
  });

  it('L3 wave13 countAppointedBy', () => {
    const desk = new MemoryAmbassadorProgramme();
    const u1 = '11111111-1111-4111-8111-111111111111';
    const u2 = '33333333-3333-4333-8333-333333333333';
    const opA = '22222222-2222-4222-8222-222222222222';
    const opB = '44444444-4444-4444-8444-444444444444';
    expect(desk.countAppointedBy(opA)).toBe(0);
    desk.appoint({ userId: u1, appointedBy: opA });
    desk.appoint({ userId: u2, appointedBy: opB });
    expect(desk.countAppointedBy(opA)).toBe(1);
    expect(desk.countAppointedBy(opB)).toBe(1);
    expect(desk.countAppointedBy('')).toBe(0);
  });

  it('L3 frozenCount without invent', () => {
    const desk = new MemoryAmbassadorProgramme();
    const u = '11111111-1111-4111-8111-111111111111';
    const op = '22222222-2222-4222-8222-222222222222';
    expect(desk.frozenCount()).toBe(0);
    desk.appoint({ userId: u, appointedBy: op });
    desk.freeze({ userId: u, frozenBy: op, reason: 'policy hold' });
    expect(desk.frozenCount()).toBe(1);
  });
  it('L3 isAmbassadorFrozen without invent', () => {
    const desk = new MemoryAmbassadorProgramme();
    const u = '11111111-1111-4111-8111-111111111111';
    const op = '22222222-2222-4222-8222-222222222222';
    expect(desk.isAmbassadorFrozen(u)).toBe(false);
    desk.appoint({ userId: u, appointedBy: op });
    expect(desk.isAmbassadorFrozen(u)).toBe(false);
    desk.freeze({ userId: u, frozenBy: op, reason: 'policy hold' });
    expect(desk.isAmbassadorFrozen(u)).toBe(true);
  });

  it('L3 wave16 listAllUserIds + totalCount', () => {
    const desk = new MemoryAmbassadorProgramme();
    const u1 = '11111111-1111-4111-8111-111111111111';
    const u2 = '33333333-3333-4333-8333-333333333333';
    const op = '22222222-2222-4222-8222-222222222222';
    expect(desk.listAllUserIds()).toEqual([]);
    expect(desk.totalCount()).toBe(0);
    desk.appoint({ userId: u2, appointedBy: op });
    desk.appoint({ userId: u1, appointedBy: op });
    expect(desk.totalCount()).toBe(2);
    expect(desk.listAllUserIds()).toEqual([u1, u2]);
  });

  it('L3 isEmpty without invent', () => {
    const desk = new MemoryAmbassadorProgramme();
    expect(desk.isEmpty()).toBe(true);
    desk.appoint({ userId: '11111111-1111-4111-8111-111111111111', appointedBy: '22222222-2222-4222-8222-222222222222' });
    expect(desk.isEmpty()).toBe(false);
  });

  it('L3 activeRatio null when empty', () => {
    const desk = new MemoryAmbassadorProgramme();
    expect(desk.activeRatio()).toBeNull();
    const u = '11111111-1111-4111-8111-111111111111';
    const op = '22222222-2222-4222-8222-222222222222';
    desk.appoint({ userId: u, appointedBy: op });
    expect(desk.activeRatio()).toBe('1.0000');
    desk.freeze({ userId: u, frozenBy: op, reason: 'policy hold' });
    expect(desk.activeRatio()).toBe('0.0000');
  });

  it('L3 frozenProgrammeIds aliases listFrozenUserIds', () => {
    const desk = new MemoryAmbassadorProgramme();
    expect(desk.frozenProgrammeIds()).toEqual([]);
    const u = '11111111-1111-4111-8111-111111111111';
    const op = '22222222-2222-4222-8222-222222222222';
    desk.appoint({ userId: u, appointedBy: op });
    desk.freeze({ userId: u, frozenBy: op, reason: 'policy hold' });
    expect(desk.frozenProgrammeIds()).toEqual([u]);
  });

  it('L3 isProgrammeActive mirrors isActiveAmbassador', () => {
    const desk = new MemoryAmbassadorProgramme();
    const u = '11111111-1111-4111-8111-111111111111';
    const op = '22222222-2222-4222-8222-222222222222';
    expect(desk.isProgrammeActive(u)).toBe(false);
    desk.appoint({ userId: u, appointedBy: op });
    expect(desk.isProgrammeActive(u)).toBe(true);
  });
});
