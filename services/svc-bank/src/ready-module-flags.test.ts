/**
 * Unit card — GET /ready names loans/cards kills beside accrual flags
 *
 * 1. Promise: operator /ready shows BANK_LOANS_ENABLED, BANK_CARDS_ENABLED,
 *    and autoInvestConvertWired (already on the router), not only job flags
 * 2. Break: /ready listed loanAccrual / autoInvest / cardProgramme; loans kill
 *    could be off while loanAccrual: true and the operator read accrual as live
 * 3. Done bar: payload has loans + cards + autoInvestConvertWired as booleans
 *    independent of loanAccrual / autoInvest / cardProgramme; index.ts GET /ready
 *    returns bankHttpReady(...) from those env/router facts
 * 4. Class N (operator honesty; no money moved)
 * 5. Paths: services/svc-bank/src/ready.ts, index.ts GET /ready only
 * 6. RED: this suite
 * 7. Collision: no open svc-bank product PRs; did not mill Number() bps,
 *    ops HMAC, or card-sim as issuer
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { bankHttpReady } from './ready.js';

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = readFileSync(join(here, 'index.ts'), 'utf8');

const noneCards = { id: 'none', simulated: true, displayName: 'No card programme' };
const noneRamps = {
  id: 'none',
  simulated: true,
  displayName: 'No bank ramp programme',
  cryptoRail: null,
  fiatLeg: 'socket.psp-partners',
  fiatVia: 'svc-pay.RailAdapter',
};

describe('bankHttpReady — module kills beside job flags', () => {
  it('loans can be off while loanAccrual is on — both named', () => {
    const body = bankHttpReady({
      scheduledTransfers: true,
      interestAccrual: true,
      loanAccrual: true,
      loanRiskSweep: false,
      autoInvest: true,
      loans: false,
      cards: true,
      autoInvestConvertWired: true,
      cardProgramme: noneCards,
      rampProgramme: noneRamps,
    });
    expect(body.ready).toBe(true);
    expect(body.loanAccrual).toBe(true);
    expect(body.loans).toBe(false);
    expect(body.cards).toBe(true);
    expect(body.autoInvestConvertWired).toBe(true);
  });

  it('cards kill is not cardProgramme, convert wired is not autoInvest', () => {
    const body = bankHttpReady({
      scheduledTransfers: false,
      interestAccrual: false,
      loanAccrual: false,
      loanRiskSweep: false,
      autoInvest: true,
      loans: true,
      cards: false,
      autoInvestConvertWired: false,
      cardProgramme: { id: 'card-sim', simulated: true, displayName: 'Simulated card (no card programme)' },
      rampProgramme: noneRamps,
    });
    expect(body.cards).toBe(false);
    expect(body.cardProgramme.id).toBe('card-sim');
    expect(body.cardProgramme.simulated).toBe(true);
    expect(body.autoInvest).toBe(true);
    expect(body.autoInvestConvertWired).toBe(false);
  });

  it('GET /ready as index.ts mounts returns the three module flags', async () => {
    const app = Fastify({ logger: false });
    app.get('/ready', async () =>
      bankHttpReady({
        scheduledTransfers: true,
        interestAccrual: true,
        loanAccrual: true,
        loanRiskSweep: true,
        autoInvest: true,
        loans: false,
        cards: false,
        autoInvestConvertWired: false,
        cardProgramme: noneCards,
        rampProgramme: noneRamps,
      }),
    );
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    const json = res.json() as ReturnType<typeof bankHttpReady>;
    expect(json.loans).toBe(false);
    expect(json.cards).toBe(false);
    expect(json.autoInvestConvertWired).toBe(false);
    expect(json.loanAccrual).toBe(true);
    expect(json.autoInvest).toBe(true);
    await app.close();
  });
});

describe('index.ts GET /ready uses the module-kill facts', () => {
  const readySlice = (() => {
    const start = indexSrc.indexOf("app.get('/ready'");
    if (start < 0) throw new Error('GET /ready missing from index.ts');
    return indexSrc.slice(start, start + 1800);
  })();

  it('returns bankHttpReady from ./ready.js', () => {
    expect(indexSrc).toMatch(/import\s*\{[^}]*bankHttpReady[^}]*\}\s*from\s*'\.\/ready\.js'/);
    expect(readySlice).toMatch(/bankHttpReady\s*\(/);
  });

  it('pins BANK_LOANS_ENABLED, BANK_CARDS_ENABLED, and autoInvestConvertWired', () => {
    expect(readySlice).toMatch(/loans:\s*env\.BANK_LOANS_ENABLED/);
    expect(readySlice).toMatch(/cards:\s*env\.BANK_CARDS_ENABLED/);
    expect(readySlice).toMatch(/autoInvestConvertWired:\s*usableTradeConvertUrl\(env\.TRADE_URL\)/);
  });
});
