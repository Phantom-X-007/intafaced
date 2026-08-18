/**
 * Unfreeze is a first-class control path — not "re-appoint only".
 */
import { describe, expect, it } from 'vitest';
import { MemoryAmbassadorProgramme } from './programme.js';

const OP = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

describe('ambassador unfreeze (programme control truth)', () => {
  it('freeze → unfreeze restores active badge and clears freeze reason', () => {
    const desk = new MemoryAmbassadorProgramme();
    desk.appoint({ userId: USER, appointedBy: OP });
    desk.freeze({ userId: USER, frozenBy: OP, reason: 'policy review' });
    expect(desk.badge(USER).isAmbassador).toBe(false);
    expect(desk.badge(USER).status).toBe('frozen');

    const row = desk.unfreeze({ userId: USER });
    expect(row.status).toBe('active');
    expect(row.freezeReason).toBeNull();
    expect(row.frozenAt).toBeNull();
    expect(row.frozenBy).toBeNull();

    const badge = desk.badge(USER);
    expect(badge.isAmbassador).toBe(true);
    expect(badge.status).toBe('active');
  });

  it('unfreeze refuses when not frozen', () => {
    const desk = new MemoryAmbassadorProgramme();
    desk.appoint({ userId: USER, appointedBy: OP });
    expect(() => desk.unfreeze({ userId: USER })).toThrow(/not frozen/i);
  });

  it('unfreeze refuses when missing', () => {
    const desk = new MemoryAmbassadorProgramme();
    expect(() => desk.unfreeze({ userId: USER })).toThrow(/not found|No ambassador programme row/i);
  });
});
