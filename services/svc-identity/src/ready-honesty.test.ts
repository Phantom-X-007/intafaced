/**
 * GET /ready must not hide KYC vault / ledger payout unwired behind argon2.
 * Key/URL set is config. This door does not fetch.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import {
  KYC_VAULT_UNPROBED,
  KYC_VAULT_UNWIRED,
  LEDGER_PAYOUT_UNPROBED,
  LEDGER_PAYOUT_UNWIRED,
  identityReadyHonesty,
  kycVaultHonesty,
  ledgerPayoutHonesty,
} from './ready-honesty.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('identity /ready honesty — key-set is not a live vault or ledger', () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    while (apps.length) {
      const app = apps.pop();
      if (app) await app.close();
    }
  });

  it('names kyc_doc.unwired when IDENTITY_KYC_DOC_KEY is blank', () => {
    expect(kycVaultHonesty('')).toEqual({ status: 'absent', code: KYC_VAULT_UNWIRED });
    expect(kycVaultHonesty('   ')).toEqual({ status: 'absent', code: KYC_VAULT_UNWIRED });
    expect(kycVaultHonesty(undefined)).toEqual({ status: 'absent', code: KYC_VAULT_UNWIRED });
    expect(kycVaultHonesty(null)).toEqual({ status: 'absent', code: KYC_VAULT_UNWIRED });
  });

  it('nonempty KYC key is configured + unprobed, never a live vault', () => {
    expect(kycVaultHonesty('not-probed-key-material')).toEqual({
      status: 'configured',
      code: KYC_VAULT_UNPROBED,
    });
  });

  it('names affiliate.payout.ledger_unwired when LEDGER_URL is blank', () => {
    expect(ledgerPayoutHonesty('')).toEqual({ status: 'absent', code: LEDGER_PAYOUT_UNWIRED });
    expect(ledgerPayoutHonesty('   ')).toEqual({ status: 'absent', code: LEDGER_PAYOUT_UNWIRED });
    expect(ledgerPayoutHonesty(undefined)).toEqual({ status: 'absent', code: LEDGER_PAYOUT_UNWIRED });
    expect(ledgerPayoutHonesty(null)).toEqual({ status: 'absent', code: LEDGER_PAYOUT_UNWIRED });
  });

  it('nonempty LEDGER_URL is configured + unprobed, never a live payout', () => {
    expect(ledgerPayoutHonesty('http://svc-ledger:4001')).toEqual({
      status: 'configured',
      code: LEDGER_PAYOUT_UNPROBED,
    });
  });

  it('/ready.ready is process liveness, not key-set or URL-set', () => {
    const blank = identityReadyHonesty({ kycDocKey: '', ledgerUrl: undefined });
    const set = identityReadyHonesty({
      kycDocKey: 'not-probed-key-material',
      ledgerUrl: 'http://svc-ledger:4001',
    });
    expect(blank.ready).toBe(true);
    expect(set.ready).toBe(true);
    expect(blank.ready).toBe(set.ready);
    expect(blank.kycVault.status).not.toBe(set.kycVault.status);
    expect(blank.ledgerPayout.status).not.toBe(set.ledgerPayout.status);
    expect(blank.kycVault).toEqual({ status: 'absent', code: KYC_VAULT_UNWIRED });
    expect(blank.ledgerPayout).toEqual({ status: 'absent', code: LEDGER_PAYOUT_UNWIRED });
    expect(set.kycVault).toEqual({ status: 'configured', code: KYC_VAULT_UNPROBED });
    expect(set.ledgerPayout).toEqual({ status: 'configured', code: LEDGER_PAYOUT_UNPROBED });
  });

  it('GET /ready names unwired planes when key and URL are blank', async () => {
    const app = Fastify({ logger: false });
    app.get('/ready', async () => ({
      ...identityReadyHonesty({ kycDocKey: '', ledgerUrl: undefined }),
      argon2: true,
    }));
    await app.ready();
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.ready).toBe(true);
    expect(body.argon2).toBe(true);
    expect(body.kycVault).toEqual({ status: 'absent', code: KYC_VAULT_UNWIRED });
    expect(body.ledgerPayout).toEqual({ status: 'absent', code: LEDGER_PAYOUT_UNWIRED });
    expect(JSON.stringify(body)).not.toMatch(/"wired"\s*:\s*true/);
  });

  it('GET /ready names configured + unprobed when key and URL are set — not live', async () => {
    const app = Fastify({ logger: false });
    app.get('/ready', async () => ({
      ...identityReadyHonesty({
        kycDocKey: 'not-probed-key-material',
        ledgerUrl: 'http://svc-ledger:4001',
      }),
      argon2: false,
    }));
    await app.ready();
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body.ready).toBe(true);
    expect(body.argon2).toBe(false);
    expect(body.kycVault).toEqual({ status: 'configured', code: KYC_VAULT_UNPROBED });
    expect(body.ledgerPayout).toEqual({ status: 'configured', code: LEDGER_PAYOUT_UNPROBED });
  });

  it('unwired codes match the refuse strings already on the procedures', () => {
    const boot = readFileSync(join(here, 'kyc/boot-vault.ts'), 'utf8');
    expect(boot).toContain("export const KYC_VAULT_UNWIRED = 'kyc_doc.unwired'");
    const payout = readFileSync(join(here, 'affiliates/producer-payout.ts'), 'utf8');
    expect(payout).toContain("'affiliate.payout.ledger_unwired'");
  });

  it('index.ts serves honesty helpers, not argon2-only ready', () => {
    const indexSrc = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(indexSrc).toContain('identityReadyHonesty');
    expect(indexSrc).toContain('kycDocKey: env.IDENTITY_KYC_DOC_KEY');
    expect(indexSrc).toContain('ledgerUrl: env.LEDGER_URL');
    expect(indexSrc).not.toMatch(/app\.get\('\/ready',\s*async\s*\(\)\s*=>\s*\(\{\s*ready:\s*true,\s*argon2:/);
    expect(indexSrc).not.toMatch(/fetch\(/);
  });
});
