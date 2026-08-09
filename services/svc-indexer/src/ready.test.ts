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
