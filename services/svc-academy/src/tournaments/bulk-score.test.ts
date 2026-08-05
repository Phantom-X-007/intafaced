import { describe, expect, it } from 'vitest';
import { applyBulkScorePatches, isBulkScoreOk, summarizeBulkScoreResult, validateBulkScoreWrite } from './bulk-score.js';

describe('tournament L3 bulk score (no prizes)', () => {
  it('refuses non-live season and empty patches', () => {
    expect(validateBulkScoreWrite({ seasonStatus: 'frozen', seasonId: 's1', patches: [{ userId: 'u', score: 1 }] }).status).toBe('refuse');
    expect(validateBulkScoreWrite({ seasonStatus: 'live', seasonId: 's1', patches: [] }).status).toBe('refuse');
  });

  it('refuses duplicate user and bad score', () => {
    expect(
      validateBulkScoreWrite({
        seasonStatus: 'live',
        seasonId: 's1',
        patches: [
          { userId: 'u1', score: 1 },
          { userId: 'u1', score: 2 },
        ],
      }),
    ).toMatchObject({ status: 'refuse', reason: 'duplicate_user' });
    expect(validateBulkScoreWrite({ seasonStatus: 'live', seasonId: 's1', patches: [{ userId: 'u1', score: -1 }] })).toMatchObject({
      status: 'refuse',
      reason: 'invalid_row',
    });
  });

  it('applies validated patches without invent scores', () => {
    const v = validateBulkScoreWrite({
      seasonStatus: 'live',
      seasonId: 's1',
      patches: [
        { userId: 'a', score: 10 },
        { userId: 'b', score: 20 },
      ],
    });
    expect(v.status).toBe('ok');
    if (v.status !== 'ok') return;
    const now = new Date('2026-08-05T00:00:00.000Z');
    const rows = applyBulkScorePatches('s1', [], v.patches, now);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.userId === 'b')?.score).toBe(20);
    expect(summarizeBulkScoreResult(v)).toEqual({ accepted: 2, refused: false, reason: null });
    expect(isBulkScoreOk(v)).toBe(true);
    const refused = validateBulkScoreWrite({ seasonStatus: 'frozen', seasonId: 's1', patches: [{ userId: 'u', score: 1 }] });
    expect(summarizeBulkScoreResult(refused)).toEqual({ accepted: 0, refused: true, reason: 'season_not_live' });
    expect(isBulkScoreOk(refused)).toBe(false);
  });
});
