import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseOwnerIntegerEnv } from './fee-bps-env.js';
import { P2pError, publishedFeeBps } from './p2p-service.js';

/**
 * Owner house take is refuse-closed when unset.
 *
 * Compose used to omit P2P_FEE_BPS so env.ts default(30) invented 30 bps on
 * every clean clone. Blank is unset; 0 is only when the owner publishes 0.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('P2P_FEE_BPS unset refuse', () => {
  it('blank / omit parse to null — never 30', () => {
    expect(parseOwnerIntegerEnv(undefined)).toBeNull();
    expect(parseOwnerIntegerEnv(null)).toBeNull();
    expect(parseOwnerIntegerEnv('')).toBeNull();
    expect(parseOwnerIntegerEnv('   ')).toBeNull();
    expect(parseOwnerIntegerEnv('30')).toBe(30);
    expect(parseOwnerIntegerEnv(0)).toBe(0);
  });

  it('env.ts does not git-default 30', () => {
    const envTs = readFileSync(join(ROOT, 'services/svc-p2p/src/env.ts'), 'utf8');
    expect(envTs).not.toMatch(/P2P_FEE_BPS:[\s\S]{0,200}\.default\(\s*30\s*\)/);
    expect(envTs).toMatch(/parseOwnerIntegerEnv/);
  });

  it('compose passes empty — never a baked 30', () => {
    const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
    const start = compose.indexOf('\n  svc-p2p:');
    const rest = compose.slice(start + 1);
    const next = rest.search(/\n  svc-[a-z]+:/);
    const block = next === -1 ? rest : rest.slice(0, next);
    expect(block).toMatch(/P2P_FEE_BPS:\s*\$\{P2P_FEE_BPS:-\}/);
    expect(block).not.toMatch(/P2P_FEE_BPS:\s*\$\{P2P_FEE_BPS:-30\}/);
    expect(block).not.toMatch(/P2P_FEE_BPS:\s*['"]?30/);
  });

  it('publishedFeeBps refuses null rather than inventing 30 or 0', () => {
    expect(() => publishedFeeBps(null)).toThrow(P2pError);
    expect(() => publishedFeeBps(undefined)).toThrow(expect.objectContaining({ code: 'p2p.fee_bps_unset' }));
    expect(publishedFeeBps(0)).toBe(0);
    expect(publishedFeeBps(30)).toBe(30);
  });
});
