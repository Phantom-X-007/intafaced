import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AcademyError } from '../errors.js';
import {
  assertCallerCannotLiePaperFlag,
  assertPaperMarketsListLimit,
  createTradePublicPaperFlagPort,
  memoryPaperFlagPort,
} from './market-flag-verify.js';

const PAPER = { marketId: 'mkt-paper-1', paper: true as const, symbol: 'PAPER/USD' };
const LIVE_CLAIM = { marketId: 'mkt-live-1', paper: true as const, symbol: 'BTC/USDT' };

const listing = memoryPaperFlagPort([
  { marketId: 'mkt-paper-1', symbol: 'PAPER/USD', paper: true },
  { marketId: 'mkt-live-1', symbol: 'BTC/USDT', paper: false },
]);

describe('paper flag is not taken on trust', () => {
  it('missing market is left to the loop (no_market)', async () => {
    await expect(assertCallerCannotLiePaperFlag(listing, null)).resolves.toBeUndefined();
  });

  it('false paper is left to the loop (not_paper) — never a silent live drill', async () => {
    await expect(
      assertCallerCannotLiePaperFlag(listing, { marketId: 'mkt-live-1', paper: false, symbol: 'BTC/USDT' }),
    ).resolves.toBeUndefined();
  });

  it('TRADE_URL unset / no port → named refuse, does not trust paper: true', async () => {
    await expect(assertCallerCannotLiePaperFlag(undefined, PAPER)).rejects.toMatchObject({
      name: 'AcademyError',
      code: 'academy.paper_flag_unverified',
    });
  });

  it('caller cannot label a live listing as paper', async () => {
    await expect(assertCallerCannotLiePaperFlag(listing, LIVE_CLAIM)).rejects.toMatchObject({
      name: 'AcademyError',
      code: 'academy.paper_flag_mismatch',
    });
  });

  it('unlisted claimed paper market refuses by name', async () => {
    await expect(
      assertCallerCannotLiePaperFlag(listing, { marketId: 'mkt-ghost', paper: true, symbol: 'GHOST/USD' }),
    ).rejects.toMatchObject({ code: 'academy.paper_market_unlisted' });
  });

  it('trade-listed paper:true is accepted', async () => {
    await expect(assertCallerCannotLiePaperFlag(listing, PAPER)).resolves.toBeUndefined();
  });

  it('id/symbol mismatch vs listing refuses (wire identity lie)', async () => {
    await expect(
      assertCallerCannotLiePaperFlag(listing, { marketId: 'mkt-paper-1', paper: true, symbol: 'BTC/USDT' }),
    ).rejects.toMatchObject({ code: 'academy.paper_flag_mismatch' });
  });

  it('HTTP listing paper:false refuses mismatch; paper:true accepts', async () => {
    const fetchImpl: typeof fetch = async (url) => {
      expect(String(url)).toBe('http://svc-trade:4004/api/v1/markets?limit=50');
      return new Response(
        JSON.stringify([
          { id: 'mkt-paper-1', symbol: 'PAPER/USD', paper: true },
          { id: 'mkt-live-1', symbol: 'BTC/USDT', paper: false },
        ]),
        { status: 200 },
      );
    };
    const port = createTradePublicPaperFlagPort({ baseUrl: 'http://svc-trade:4004', fetchImpl, limit: 50 });
    await expect(assertCallerCannotLiePaperFlag(port, PAPER)).resolves.toBeUndefined();
    await expect(assertCallerCannotLiePaperFlag(port, LIVE_CLAIM)).rejects.toBeInstanceOf(AcademyError);
    try {
      await assertCallerCannotLiePaperFlag(port, LIVE_CLAIM);
    } catch (err) {
      expect((err as AcademyError).code).toBe('academy.paper_flag_mismatch');
    }
  });

  it('unreachable listing refuses unavailable — never trusts the caller', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('ECONNREFUSED');
    };
    const port = createTradePublicPaperFlagPort({ baseUrl: 'http://svc-trade:4004', fetchImpl, limit: 50 });
    await expect(assertCallerCannotLiePaperFlag(port, PAPER)).rejects.toMatchObject({
      code: 'academy.paper_flag_unavailable',
    });
  });

  it('unset markets list limit refuses by name — never invent 50 or fetch', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error('must not fetch');
    };
    const port = createTradePublicPaperFlagPort({ baseUrl: 'http://svc-trade:4004', fetchImpl });
    await expect(assertCallerCannotLiePaperFlag(port, PAPER)).rejects.toMatchObject({
      name: 'AcademyError',
      code: 'academy.paper_markets_limit_unset',
    });
  });

  it('owner-published 500 reaches the query string', async () => {
    const fetchImpl: typeof fetch = async (url) => {
      expect(String(url)).toBe('http://svc-trade:4004/api/v1/markets?limit=500');
      return new Response(JSON.stringify([{ id: 'mkt-paper-1', symbol: 'PAPER/USD', paper: true }]), { status: 200 });
    };
    const port = createTradePublicPaperFlagPort({ baseUrl: 'http://svc-trade:4004', fetchImpl, limit: 500 });
    await expect(assertCallerCannotLiePaperFlag(port, PAPER)).resolves.toBeUndefined();
  });

  it('trade HTTP 400 markets_limit_unset surfaces unavailable — never invents paper=true', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ intafacedCode: 'trade.markets_limit_unset' }), { status: 400 });
    const port = createTradePublicPaperFlagPort({ baseUrl: 'http://svc-trade:4004', fetchImpl, limit: 50 });
    await expect(assertCallerCannotLiePaperFlag(port, PAPER)).rejects.toMatchObject({
      code: 'academy.paper_flag_unavailable',
    });
  });
});

describe('assertPaperMarketsListLimit matches trade 1..500', () => {
  it('omit / null / 0 / 501 / garbage refuse — never invent 50', () => {
    for (const limit of [undefined, null, Number.NaN, 0, -1, 501, 50.5, '50'] as const) {
      expect(() => assertPaperMarketsListLimit(limit)).toThrow(AcademyError);
    }
    try {
      assertPaperMarketsListLimit(undefined);
      throw new Error('expected refuse academy.paper_markets_limit_unset');
    } catch (err) {
      expect((err as AcademyError).code).toBe('academy.paper_markets_limit_unset');
      expect((err as AcademyError).message).not.toMatch(/\?\? 50|default 50/i);
    }
  });

  it('owner-published 1, 50, and 500 are accepted', () => {
    expect(assertPaperMarketsListLimit(1)).toBe(1);
    expect(assertPaperMarketsListLimit(50)).toBe(50);
    expect(assertPaperMarketsListLimit(500)).toBe(500);
  });
});

describe('public-door reopen pin — paperDrill must verify before looping', () => {
  const routerPath = fileURLToPath(new URL('../router.ts', import.meta.url));
  const indexPath = fileURLToPath(new URL('../index.ts', import.meta.url));
  const envPath = fileURLToPath(new URL('../env.ts', import.meta.url));

  it('paperDrill and paperDrillResult call assertCallerPaperFlagVerified', () => {
    const text = readFileSync(routerPath, 'utf8');
    const drill = text.indexOf('paperDrill:');
    const result = text.indexOf('paperDrillResult:');
    const ops = text.indexOf('paperOpsStatus:');
    expect(drill).toBeGreaterThan(-1);
    expect(result).toBeGreaterThan(drill);
    expect(ops).toBeGreaterThan(result);
    const drillRegion = text.slice(drill, result);
    const resultRegion = text.slice(result, ops);
    expect(drillRegion).toContain('assertCallerPaperFlagVerified');
    expect(resultRegion).toContain('assertCallerPaperFlagVerified');
    // Must run before the loop that would otherwise trust market.paper.
    expect(drillRegion.indexOf('assertCallerPaperFlagVerified')).toBeLessThan(drillRegion.indexOf('startPaperDrillForCatalogItem'));
    expect(resultRegion.indexOf('assertCallerPaperFlagVerified')).toBeLessThan(resultRegion.indexOf('replayPaperDrill'));
  });

  it('unset TRADE_URL does not default to a silent trust port', () => {
    const env = readFileSync(envPath, 'utf8');
    const index = readFileSync(indexPath, 'utf8');
    expect(env).toContain('TRADE_URL');
    expect(env).not.toMatch(/TRADE_URL:[\s\S]{0,80}default\('http:\/\/localhost:4004'\)/);
    expect(index).toMatch(/env\.TRADE_URL\s*\?/);
    expect(index).toContain('createTradePublicPaperFlagPort');
    expect(index).toContain('paperMarketFlagPort');
  });

  it('paper flag port passes owner-published ACADEMY_PAPER_MARKETS_LIMIT — never invents 50', () => {
    const env = readFileSync(envPath, 'utf8');
    const index = readFileSync(indexPath, 'utf8');
    const verify = readFileSync(fileURLToPath(new URL('./market-flag-verify.ts', import.meta.url)), 'utf8');
    expect(env).toContain('ACADEMY_PAPER_MARKETS_LIMIT');
    expect(env).not.toMatch(/ACADEMY_PAPER_MARKETS_LIMIT:[\s\S]{0,400}\.default\(50\)/);
    expect(index).toContain('ACADEMY_PAPER_MARKETS_LIMIT');
    expect(index).not.toMatch(/limit:\s*50\b/);
    expect(verify).toContain('/api/v1/markets?limit=');
    expect(verify).not.toMatch(/doFetch\(`\$\{base\}\/api\/v1\/markets`\)/);
  });
});
