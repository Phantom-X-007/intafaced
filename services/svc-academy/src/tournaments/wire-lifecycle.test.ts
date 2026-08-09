/**
 * Wire residual: setSeasonStatus used to UPDATE any enum value.
 * Pure transitionSeason is the law — these RED-level cases must stay refused
 * so re-open / re-rank after end cannot slip past the service gate.
 */
import { describe, expect, it } from 'vitest';
import { transitionSeason } from './season-lifecycle.js';
import { TournamentError, type SeasonRecord } from './ladder.js';
import {
  decidePrizeIntent,
  isPrizeRefuseClosed,
  prizeRefuseStatusLine,
  assertNoPrizeAttachment,
  type PrizeIntentKind,
} from './prize-refuse.js';

const base = (status: SeasonRecord['status']): SeasonRecord => ({
  id: '11111111-1111-1111-1111-111111111111',
  slug: 'spring-open',
  title: 'Spring Open',
  status,
  rulesSummary: 'Paper ladder only — no prize money on this stage.',
  startsAt: new Date('2026-08-01T00:00:00.000Z'),
  endsAt: null,
});

describe('tournament lifecycle edges (service must call these)', () => {
  it('refuses scheduled → frozen (illegal jump that raw SQL used to allow)', () => {
    expect(() => transitionSeason(base('scheduled'), 'frozen')).toThrow(TournamentError);
    try {
      transitionSeason(base('scheduled'), 'frozen');
    } catch (e) {
      expect(e).toBeInstanceOf(TournamentError);
      expect((e as TournamentError).code).toBe('academy.season_invalid');
    }
  });

  it('refuses ended → live (re-open / re-rank hole)', () => {
    expect(() => transitionSeason(base('ended'), 'live')).toThrow(TournamentError);
  });

  it('refuses frozen → live (re-open re-rank + stale freeze snapshot hole)', () => {
    expect(() => transitionSeason(base('frozen'), 'live')).toThrow(TournamentError);
    try {
      transitionSeason(base('frozen'), 'live');
    } catch (e) {
      expect(e).toBeInstanceOf(TournamentError);
      expect((e as TournamentError).code).toBe('academy.season_invalid');
      expect((e as TournamentError).message).toMatch(/frozen.*live/i);
    }
  });

  it('allows live → frozen, frozen → ended, and scheduled → live', () => {
    expect(transitionSeason(base('live'), 'frozen').status).toBe('frozen');
    expect(transitionSeason(base('frozen'), 'ended').status).toBe('ended');
    expect(transitionSeason(base('scheduled'), 'live').status).toBe('live');
  });

  it('assertNoPrizeAttachment refuses invent prize fields on a season-shaped payload', () => {
    expect(() => assertNoPrizeAttachment({ ...base('live'), prizePool: '1000' })).toThrow(TournamentError);
  });
});

describe('tournament prize plane honesty (blank prizes refuse)', () => {
  const kinds: PrizeIntentKind[] = ['fund_pool', 'payout', 'escrow', 'clawback', 'invent_balance'];

  it('every prize-shaped intent refuses closed with no ledger recipe', () => {
    for (const kind of kinds) {
      const d = decidePrizeIntent(kind);
      expect(isPrizeRefuseClosed(d)).toBe(true);
      expect(d.academyHoldsPrizeBalance).toBe(false);
      expect(d.ledgerRecipeReady).toBe(false);
      expect(d).not.toHaveProperty('amount');
      expect(d).not.toHaveProperty('prizeAmount');
    }
  });

  it('status line is greppable and invent-free', () => {
    expect(prizeRefuseStatusLine()).toBe('prizes=refuse_closed code=academy.prize_refuse_closed ledger=0');
  });
});
