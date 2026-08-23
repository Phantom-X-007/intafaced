import { describe, expect, it } from 'vitest';
import { checkAccess } from '@intafaced/config';
import { createEdgeContext } from '@intafaced/contracts';
import { QUANT_SANDBOX_ESCAPE, QUANT_SANDBOX_UNWIRED, QUANT_VENUE_VAULT_UNSET } from './errors.js';
import { createQuantRouter } from './router.js';

const SECRET = 'a-quant-mount-test-edge-secret-long-enough';
const edgeContext = createEdgeContext({ secret: SECRET, serviceName: 'svc-quant' });
const anonymous = (region = 'DE') => edgeContext({ headers: { 'x-intafaced-region': region }, id: 'req-anon' });

const limits = { maxOps: 5_000, maxSource: 8_000 };

const SAMPLE_JS = `const px = market.last("BTC-USD");
oms.buy("BTC-USD", "0.01");
console.log(px);
console.log(book.cash());
console.log(book.pnl());`;

describe('svc-quant mount — sandbox.run', () => {
  it('serves a five-line javascript run over the wire with decimal-string pnl', async () => {
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits }).createCaller(anonymous());
    const ran = await caller.sandbox.run({ language: 'javascript', source: SAMPLE_JS, cash: '10000' });
    expect(ran.ok).toBe(true);
    expect(typeof ran.pnl).toBe('string');
    expect(typeof ran.cash).toBe('string');
    expect(ran.fills[0]?.qty).toBe('0.01');
    expect(ran.venue).toBe('internal');
    expect(ran.venueVault).toBe('unset');
  });

  it('serves python the same way', async () => {
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits }).createCaller(anonymous());
    const ran = await caller.sandbox.run({
      language: 'python',
      source: 'oms.buy("BTC-USD", "0.01")\nprint(book.pnl())',
      cash: '10000',
    });
    expect(ran.pnl).toBe('0');
    expect(ran.logs[0]).toBe('0');
  });

  it('refuses unwired isolate by name, and does not invent pnl', async () => {
    const caller = createQuantRouter({ wired: false, venueVaultSet: false, limits }).createCaller(anonymous());
    await expect(caller.sandbox.run({ language: 'javascript', source: SAMPLE_JS, cash: '10000' })).rejects.toMatchObject({
      message: expect.stringContaining(QUANT_SANDBOX_UNWIRED),
    });
  });

  it('refuses a network escape rather than running it', async () => {
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits }).createCaller(anonymous());
    await expect(
      caller.sandbox.run({ language: 'javascript', source: 'fetch("https://evil.example")', cash: '10000' }),
    ).rejects.toMatchObject({
      message: expect.stringContaining(QUANT_SANDBOX_ESCAPE),
    });
  });

  it('refuses venue OMS when the vault pin is unset', async () => {
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits }).createCaller(anonymous());
    await expect(
      caller.sandbox.run({ language: 'javascript', source: 'oms.venueBuy("BTC-USD", "0.01")', cash: '10000' }),
    ).rejects.toMatchObject({
      message: expect.stringContaining(QUANT_VENUE_VAULT_UNSET),
    });
  });

  it('admits the sandbox without KYC on the fiat paper book', () => {
    const decision = checkAccess({ module: 'quant', plane: 'fiat', region: 'DE', kycTier: 'none' });
    expect(decision.allowed).toBe(true);
  });

  it('reports capabilities without fabricating a vault', async () => {
    const caller = createQuantRouter({ wired: true, venueVaultSet: false, limits }).createCaller(anonymous());
    const caps = await caller.sandbox.capabilities();
    expect(caps.isolate).toBe('wired');
    expect(caps.venueVault).toBe('unset');
    expect(caps.languages).toContain('python');
  });
});
