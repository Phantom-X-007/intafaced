import { describe, expect, it } from 'vitest';
import type { Sql } from 'postgres';
import { ReferralService } from './referral-service.js';

const U = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const AT = new Date('2026-08-07T15:00:00.000Z');

function sqlForEdges(edges: Array<{ user_id: string; referrer_id: string; attributed_at: Date }>): Sql {
  const fn = async (strings: TemplateStringsArray) => {
    const q = strings.join('').replace(/\s+/g, ' ');
    if (q.includes('SELECT user_id, referrer_id FROM referral_edges')) {
      return edges.map(({ user_id, referrer_id }) => ({ user_id, referrer_id }));
    }
    if (q.includes('SELECT user_id, attributed_at FROM referral_edges')) {
      return edges.map(({ user_id, attributed_at }) => ({ user_id, attributed_at }));
    }
    throw new Error(`unexpected sql: ${q}`);
  };
  return fn as unknown as Sql;
}

describe('ReferralService.listMembers frozen overlay filter', () => {
  const edges = [
    { user_id: U(2), referrer_id: U(1), attributed_at: AT },
    { user_id: U(3), referrer_id: U(2), attributed_at: AT },
    { user_id: U(4), referrer_id: U(1), attributed_at: AT },
  ];
  const svc = new ReferralService(sqlForEdges(edges));
  const frozenIds = new Set([U(2)]);

  it('omits frozen → mixed roster; rootId still works', async () => {
    const all = await svc.listMembers(frozenIds);
    expect(all.members.map((m) => m.userId)).toEqual([U(2), U(4), U(3)]);
    expect(all.members.find((m) => m.userId === U(2))?.frozen).toBe(true);
    expect(all.members.find((m) => m.userId === U(3))?.frozen).toBe(false);
    expect(all.board).toEqual({ total: 3, frozenInList: 1, maxDepthInList: 2, rootId: null });

    const under = await svc.listMembers(frozenIds, U(2));
    expect(under.members.map((m) => m.userId)).toEqual([U(3)]);
    expect(under.board).toEqual({ total: 1, frozenInList: 0, maxDepthInList: 2, rootId: U(2) });
  });

  it('frozen true/false exact-match after overlay; unmatched → empty + honest zeros', async () => {
    const onlyFrozen = await svc.listMembers(frozenIds, null, true);
    expect(onlyFrozen.members.map((m) => m.userId)).toEqual([U(2)]);
    expect(onlyFrozen.members.every((m) => m.frozen)).toBe(true);
    expect(onlyFrozen.board).toEqual({ total: 1, frozenInList: 1, maxDepthInList: 1, rootId: null });

    const onlyLive = await svc.listMembers(frozenIds, null, false);
    expect(onlyLive.members.map((m) => m.userId)).toEqual([U(4), U(3)]);
    expect(onlyLive.members.every((m) => m.frozen === false)).toBe(true);
    expect(onlyLive.board).toEqual({ total: 2, frozenInList: 0, maxDepthInList: 2, rootId: null });

    const miss = await svc.listMembers(frozenIds, U(2), true);
    expect(miss.members).toEqual([]);
    expect(miss.board).toEqual({ total: 0, frozenInList: 0, maxDepthInList: 0, rootId: U(2) });
  });
});
