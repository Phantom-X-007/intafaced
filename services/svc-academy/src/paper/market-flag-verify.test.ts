import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AcademyError } from '../errors.js';
import { assertCallerCannotLiePaperFlag, createTradePublicPaperFlagPort, memoryPaperFlagPort } from './market-flag-verify.js';

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
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify([
          { id: 'mkt-paper-1', symbol: 'PAPER/USD', paper: true },
          { id: 'mkt-live-1', symbol: 'BTC/USDT', paper: false },
        ]),
        { status: 200 },
      );
    const port = createTradePublicPaperFlagPort({ baseUrl: 'http://svc-trade:4004', fetchImpl });
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
    const port = createTradePublicPaperFlagPort({ baseUrl: 'http://svc-trade:4004', fetchImpl });
    await expect(assertCallerCannotLiePaperFlag(port, PAPER)).rejects.toMatchObject({
      code: 'academy.paper_flag_unavailable',
    });
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
});
