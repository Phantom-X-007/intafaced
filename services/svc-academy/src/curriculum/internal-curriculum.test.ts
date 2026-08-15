import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { serviceAuthHeaders } from '@intafaced/contracts';
import { curriculumSpineSize, hasCurriculumSlug, listCurriculumSlugs } from './catalog.js';
import { coachSpineIsComplete, coachSpinePayload } from './coach-spine.js';
import { registerInternalCurriculumRoute } from './internal-curriculum.js';

const SECRET = 'academy-internal-curriculum-test-secret-32ch';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('coach spine payload', () => {
  it('lists slug+title for every spine row and never a lesson body', () => {
    const payload = coachSpinePayload();
    expect(coachSpineIsComplete(payload)).toBe(true);
    expect(payload.licensedLibraryImported).toBe(false);
    expect(payload.source).toBe('platform-spine');
    expect(payload.items.length).toBe(curriculumSpineSize());
    expect(payload.items.length).toBeGreaterThan(0);
    for (const item of payload.items) {
      expect(hasCurriculumSlug(item.slug)).toBe(true);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item).not.toHaveProperty('body');
    }
    expect(payload.items.map((i) => i.slug).sort()).toEqual([...listCurriculumSlugs()].slice().sort());
  });
});

describe('GET /internal/curriculum', () => {
  it('refuses unsigned callers and serves the spine with service HMAC', async () => {
    const app = Fastify();
    registerInternalCurriculumRoute(app, SECRET);
    await app.ready();

    const bare = await app.inject({ method: 'GET', url: '/internal/curriculum' });
    expect(bare.statusCode).toBe(401);
    expect(bare.json()).toMatchObject({ code: 'academy.unauthenticated' });

    const ok = await app.inject({
      method: 'GET',
      url: '/internal/curriculum',
      headers: serviceAuthHeaders('svc-agents', SECRET),
    });
    expect(ok.statusCode).toBe(200);
    const body = ok.json() as ReturnType<typeof coachSpinePayload>;
    expect(coachSpineIsComplete(body)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/"body"/);

    await app.close();
  });

  it('index mounts the internal curriculum door', () => {
    const index = readFileSync(join(ROOT, 'services/svc-academy/src/index.ts'), 'utf8');
    expect(index).toMatch(/registerInternalCurriculumRoute/);
    expect(index).toMatch(/INTERNAL_SERVICE_SECRET/);
  });
});
