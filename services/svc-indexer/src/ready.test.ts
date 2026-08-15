import { describe, expect, it } from 'vitest';
import { readinessOf } from './ready.js';

/**
 * `/ready` is the leave-rotation signal. A deep reorg sets `halted` and the
 * projection must stop being trusted — that contract used to live only as an
 * inline Fastify handler with no test. These cases lock the pure answer so a
 * future edit cannot make halt look ready while `/health` stays green.
 */
describe('readinessOf — halt leaves the rotation', () => {
  it('returns 503 with reason when halted, even if the database is up', () => {
    const at = new Date('2026-08-09T12:00:00.000Z');
    const answer = readinessOf({ reason: 'Reorg deeper than retained history — re-index', at }, true);
    expect(answer.httpStatus).toBe(503);
    expect(answer.body).toEqual({
      ready: false,
      reason: 'Reorg deeper than retained history — re-index',
      haltedAt: '2026-08-09T12:00:00.000Z',
    });
  });

  it('returns 503 when the database is down and the indexer is not halted', () => {
    const answer = readinessOf(null, false, 'connection refused');
    expect(answer.httpStatus).toBe(503);
    expect(answer.body).toEqual({ ready: false, reason: 'connection refused' });
  });

  it('prefers the halt reason over a database failure', () => {
    const at = new Date('2026-08-09T12:00:00.000Z');
    const answer = readinessOf({ reason: 'halt-reason', at }, false, 'db-down');
    expect(answer.httpStatus).toBe(503);
    expect(answer.body).toMatchObject({ ready: false, reason: 'halt-reason' });
  });

  it('returns 200 only when not halted and the database answers', () => {
    expect(readinessOf(null, true)).toEqual({ httpStatus: 200, body: { ready: true } });
  });
});

describe('readinessOf — lastError that makes the book untrustworthy', () => {
  it('returns 503 when the chain door is broken, even if the database is up', () => {
    const answer = readinessOf(null, true, undefined, {
      code: 'indexer.chain_unreachable',
      message: 'no answer from the EVM RPC',
      at: new Date('2026-08-15T00:00:00.000Z'),
    });
    expect(answer.httpStatus).toBe(503);
    expect(answer.body.ready).toBe(false);
    if (answer.body.ready) throw new Error('expected 503');
    expect(answer.body.reason).toMatch(/indexer\.chain_unreachable/);
    expect(answer.body.reason).toMatch(/no answer from the EVM RPC/);
  });

  it('returns 503 on startHeight above tip — empty book is not "no orders"', () => {
    const answer = readinessOf(null, true, undefined, {
      code: 'indexer.start_height_above_tip',
      message: 'startHeight 50 is above chain tip 2',
      at: new Date('2026-08-15T00:00:00.000Z'),
    });
    expect(answer.httpStatus).toBe(503);
    expect(answer.body.ready).toBe(false);
  });

  it('returns 503 on startHeight unavailable under a live tip', () => {
    const answer = readinessOf(null, true, undefined, {
      code: 'indexer.start_height_unavailable',
      message: 'startHeight 0 is at or below chain tip 102, but blockAt(0) returned nothing',
      at: new Date('2026-08-15T00:00:00.000Z'),
    });
    expect(answer.httpStatus).toBe(503);
    expect(answer.body.ready).toBe(false);
  });

  it('stays 200 on a transient parent-unlink — last canonical book is still that book', () => {
    const answer = readinessOf(null, true, undefined, {
      code: 'indexer.parent_unlink',
      message: 'mid-read parent unlink',
      at: new Date('2026-08-15T00:00:00.000Z'),
    });
    expect(answer).toEqual({ httpStatus: 200, body: { ready: true } });
  });

  it('prefers halt over a serving-refuse lastError', () => {
    const at = new Date('2026-08-15T00:00:00.000Z');
    const answer = readinessOf({ reason: 'deep reorg — re-index', at }, true, undefined, {
      code: 'indexer.chain_unreachable',
      message: 'rpc down',
      at,
    });
    expect(answer.httpStatus).toBe(503);
    expect(answer.body).toMatchObject({ ready: false, reason: 'deep reorg — re-index' });
  });
});
