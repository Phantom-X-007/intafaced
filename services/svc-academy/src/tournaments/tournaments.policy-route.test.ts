import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { describeTournamentPolicy } from './tournament-policy.js';

const routerTs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../router.ts'), 'utf8');

describe('tournaments.policy wire (academy.tournaments honesty door)', () => {
  it('router mounts public tournaments.policy from describeTournamentPolicy', () => {
    expect(routerTs).toMatch(/tournaments:\s*router\s*\(\s*\{/);
    expect(routerTs).toMatch(/policy:\s*publicProcedure\.query\s*\(\s*\(\)\s*=>\s*describeTournamentPolicy\s*\(\s*\)\s*\)/);
    expect(routerTs).not.toMatch(/tournamentPolicy:\s*publicProcedure/);
  });

  it('describeTournamentPolicy stays refuse-closed with no money fields', () => {
    const p = describeTournamentPolicy();
    expect(p.movesMoney).toBe(false);
    expect(p.academyHoldsPrizeBalance).toBe(false);
    expect(p.inventsPrizeBalances).toBe(false);
    expect(p.inventsIfcCredits).toBe(false);
    expect(p).not.toHaveProperty('prizeAmount');
    expect(p).not.toHaveProperty('ifcAmount');
  });
});
