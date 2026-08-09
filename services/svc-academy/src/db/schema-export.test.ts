/**
 * Drizzle schema SoT must export every durable academy table that migrations create.
 * Missing tables here is how cert/residency progress becomes "invisible" to kit readers
 * while prod SQL tables still exist (W7 residual honesty).
 */
import { describe, expect, it } from 'vitest';
import { certEnrollments, certGrants, certItemCompletions, residencyApplications, schema, tournamentFreezeSnapshots } from './schema.js';

describe('academy drizzle schema export matches durable migrations', () => {
  it('exports cert progress tables from 0004_certs', () => {
    expect(schema.certEnrollments).toBe(certEnrollments);
    expect(schema.certItemCompletions).toBe(certItemCompletions);
    expect(schema.certGrants).toBe(certGrants);
    expect(Object.keys(schema)).toEqual(expect.arrayContaining(['certEnrollments', 'certItemCompletions', 'certGrants']));
  });

  it('exports residency applications from 0003_residencies', () => {
    expect(schema.residencyApplications).toBe(residencyApplications);
    expect(Object.keys(schema)).toContain('residencyApplications');
  });

  it('keeps freeze snapshot audit table (0005)', () => {
    expect(schema.tournamentFreezeSnapshots).toBe(tournamentFreezeSnapshots);
  });
});
