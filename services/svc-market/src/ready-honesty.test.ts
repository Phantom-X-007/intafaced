/**
 * GET /ready must not sell a constructed pg/ledger/token/identity client as live.
 * Env URL is configured / unprobed. This process does not ping any of them.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MARKET_COMMISSION_NOT_CONFIGURED,
  MARKET_IDENTITY_UNPROBED,
  MARKET_IDENTITY_UNWIRED,
  MARKET_LEDGER_UNAVAILABLE,
  MARKET_LEDGER_UNPROBED,
  MARKET_PG_UNAVAILABLE,
  MARKET_PG_UNPROBED,
  MARKET_STAKE_UNAVAILABLE,
  MARKET_TOKEN_UNPROBED,
  marketReadyHonesty,
} from './ready-honesty.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('svc-market ready honesty — constructed is not live', () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    while (apps.length) {
      const app = apps.pop();
      if (app) await app.close();
    }
  });

  it('constructed clients are configured + unprobed, never ok/wired/live', () => {
    const body = marketReadyHonesty({
      databaseUrl: 'postgres://market.example/market',
      ledgerUrl: 'http://ledger.test',
      tokenUrl: 'http://token.test',
      identityUrl: 'http://identity.test',
      commissionConfigured: true,
    });
    expect(body).toEqual({
      ready: true,
      stage: 'commerce-subscriptions',
      pg: { status: 'configured', code: MARKET_PG_UNPROBED },
      ledger: { status: 'configured', code: MARKET_LEDGER_UNPROBED },
      token: { status: 'configured', code: MARKET_TOKEN_UNPROBED },
      identity: { status: 'configured', code: MARKET_IDENTITY_UNPROBED },
      commission: { status: 'configured' },
    });
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/"wired"/);
    expect(json).not.toMatch(/"ok"/);
    expect(json).not.toMatch(/"live"/i);
    expect(json).not.toMatch(/ledger\.test|token\.test|identity\.test|market\.example/);
  });

  it('blank URLs are absent, not live leftovers', () => {
    const body = marketReadyHonesty({
      databaseUrl: '  ',
      ledgerUrl: undefined,
      tokenUrl: '',
      identityUrl: undefined,
      commissionConfigured: false,
    });
    expect(body.pg).toEqual({ status: 'absent', code: MARKET_PG_UNAVAILABLE });
    expect(body.ledger).toEqual({ status: 'absent', code: MARKET_LEDGER_UNAVAILABLE });
    expect(body.token).toEqual({ status: 'absent', code: MARKET_STAKE_UNAVAILABLE });
    expect(body.identity).toEqual({ status: 'absent', code: MARKET_IDENTITY_UNWIRED });
    expect(body.commission).toEqual({ status: 'unset', code: MARKET_COMMISSION_NOT_CONFIGURED });
    expect(body.pg.status).not.toBe('ok');
    expect(JSON.stringify(body)).not.toMatch(/"wired"/);
  });

  it('GET /ready as index.ts mounts does not echo URLs or commissionConfigured', async () => {
    const app = Fastify({ logger: false });
    app.get('/ready', async () =>
      marketReadyHonesty({
        databaseUrl: 'postgres://market.example/market',
        ledgerUrl: 'http://ledger.test',
        tokenUrl: 'http://token.test',
        identityUrl: 'http://identity.test',
        commissionConfigured: true,
      }),
    );
    await app.ready();
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.ready).toBe(true);
    expect(body).not.toHaveProperty('commissionConfigured');
    expect(body.pg).toEqual({ status: 'configured', code: MARKET_PG_UNPROBED });
    expect(body.ledger).toEqual({ status: 'configured', code: MARKET_LEDGER_UNPROBED });
    expect(body.token).toEqual({ status: 'configured', code: MARKET_TOKEN_UNPROBED });
    expect(body.identity).toEqual({ status: 'configured', code: MARKET_IDENTITY_UNPROBED });
    expect(JSON.stringify(body)).not.toMatch(/ledger\.test|token\.test|identity\.test/);
  });

  it('index.ts serves marketReadyHonesty, not a bare ready:true stamp', () => {
    const indexSrc = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(indexSrc).toContain('marketReadyHonesty');
    expect(indexSrc).toContain("app.get('/ready', async () =>");
    expect(indexSrc).toContain('marketReadyHonesty({');
    expect(indexSrc).not.toMatch(/app\.get\('\/ready',\s*async\s*\(\)\s*=>\s*\(\{\s*ready:\s*true/);
    expect(indexSrc).not.toMatch(/fetch\(/);
  });

  it('token absent reuses market.stake_unavailable (stake-source), not a second code', () => {
    const stakeSrc = readFileSync(join(here, 'stake-source.ts'), 'utf8');
    expect(stakeSrc).toContain("'market.stake_unavailable'");
    expect(MARKET_STAKE_UNAVAILABLE).toBe('market.stake_unavailable');
  });
});
