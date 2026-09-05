/**
 * GET /ready must not sell TAX_JURISDICTION_MAP_JSON length as a counsel map.
 * `{}` / `[]` are unmapped. This process does not probe counsel on /ready.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { TAX_JURISDICTION_UNMAPPED } from './codes.js';
import { taxJurisdictionReadyHonesty, taxReadyHonesty } from './ready-honesty.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('tax ready honesty — JSON-set is not mapped', () => {
  const apps: FastifyInstance[] = [];
  afterEach(async () => {
    while (apps.length) {
      const app = apps.pop();
      if (app) await app.close();
    }
  });

  it('blank / {} / [] are unmapped, never mapped', () => {
    for (const raw of ['', '   ', '{}', '[]', undefined]) {
      expect(taxJurisdictionReadyHonesty(raw)).toEqual({
        status: 'unmapped',
        code: TAX_JURISDICTION_UNMAPPED,
        regionCount: 0,
      });
    }
    expect(taxReadyHonesty({ TAX_JURISDICTION_MAP_JSON: '{}' }).jurisdiction.status).not.toBe('mapped');
  });

  it('owner regions are mapped with a count, never a length boolean', () => {
    const body = taxReadyHonesty({ TAX_JURISDICTION_MAP_JSON: '{"DE":{},"GB":{}}' });
    expect(body).toEqual({
      ready: true,
      custodial: false,
      jurisdiction: { status: 'mapped', regionCount: 2 },
    });
    expect(body).not.toHaveProperty('jurisdictionMapped');
  });

  it('GET /ready as index.ts mounts does not emit jurisdictionMapped', async () => {
    const app = Fastify({ logger: false });
    app.get('/ready', async () => taxReadyHonesty({ TAX_JURISDICTION_MAP_JSON: '{}' }));
    await app.ready();
    apps.push(app);
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ready: boolean; jurisdictionMapped?: unknown; jurisdiction: unknown };
    expect(body.ready).toBe(true);
    expect(body).not.toHaveProperty('jurisdictionMapped');
    expect(body.jurisdiction).toEqual({
      status: 'unmapped',
      code: TAX_JURISDICTION_UNMAPPED,
      regionCount: 0,
    });
  });

  it('index.ts serves taxReadyHonesty, not trim().length', () => {
    const indexSrc = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(indexSrc).toContain('taxReadyHonesty');
    expect(indexSrc).not.toMatch(/jurisdictionMapped:\s*env\.TAX_JURISDICTION_MAP_JSON\.trim\(\)\.length\s*>\s*0/);
  });
});
