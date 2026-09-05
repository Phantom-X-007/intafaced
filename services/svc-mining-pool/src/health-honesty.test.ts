/**
 * GET /health and /ready must not sell a constructed ledger/pg client as wired.
 * Env URL + secret is configured / unprobed. This process does not ping either.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  MINING_LEDGER_UNAVAILABLE,
  MINING_LEDGER_UNPROBED,
  MINING_PG_UNAVAILABLE,
  MINING_PG_UNPROBED,
  miningHealthHonesty,
} from './health-honesty.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('mining-pool health honesty — constructed is not wired', () => {
  it('payload never says wired; constructed clients are configured + unprobed', () => {
    const body = miningHealthHonesty({ ledgerConfigured: true, pgConfigured: true, jobs: ['epoch'] });
    expect(body).toEqual({
      ok: true,
      service: 'svc-mining-pool',
      ledger: { status: 'configured', code: MINING_LEDGER_UNPROBED },
      pg: { status: 'configured', code: MINING_PG_UNPROBED },
      jobs: ['epoch'],
    });
    expect(JSON.stringify(body)).not.toMatch(/wired/);
  });

  it('blank ledger/pg is absent, not unavailable-as-wired leftover', () => {
    const body = miningHealthHonesty({ ledgerConfigured: false, pgConfigured: false });
    expect(body.ledger).toEqual({ status: 'absent', code: MINING_LEDGER_UNAVAILABLE });
    expect(body.pg).toEqual({ status: 'absent', code: MINING_PG_UNAVAILABLE });
    expect(body.jobs).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/wired/);
  });

  it('server.ts serves /health and /ready via miningHealthHonesty, not wired', () => {
    const serverSrc = readFileSync(join(here, 'server.ts'), 'utf8');
    expect(serverSrc).toContain('miningHealthHonesty');
    expect(serverSrc).not.toMatch(/ledger:\s*ledger\s*\?\s*'wired'/);
    expect(serverSrc).not.toMatch(/pg:\s*sql\s*\?\s*'wired'/);
    expect(serverSrc).not.toMatch(/['"]wired['"]/);
  });

  it('pg absent reuses mining.pg_unavailable (window-store), not a second code', () => {
    const storeSrc = readFileSync(join(here, 'window-store.ts'), 'utf8');
    expect(storeSrc).toContain("export const PG_UNAVAILABLE = 'mining.pg_unavailable'");
    expect(MINING_PG_UNAVAILABLE).toBe('mining.pg_unavailable');
  });
});
