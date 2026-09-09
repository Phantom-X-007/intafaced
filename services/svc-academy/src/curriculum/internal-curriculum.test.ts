import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { serviceAuthHeaders, serviceAuthHeadersForBody } from '@intafaced/contracts';
import { coachSpineIsComplete, coachSpinePayload } from './coach-spine.js';
import { registerInternalCurriculumRoute } from './internal-curriculum.js';

const SECRET = 'academy-internal-curriculum-test-secret-32ch';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

describe('GET /internal/curriculum', () => {
  it('refuses unsigned callers and serves the spine with body-bound service HMAC', async () => {
    const app = Fastify();
    registerInternalCurriculumRoute(app, SECRET);
    await app.ready();

    const bare = await app.inject({ method: 'GET', url: '/internal/curriculum' });
    expect(bare.statusCode).toBe(401);
    expect(bare.json()).toMatchObject({ code: 'academy.unauthenticated' });

    const ok = await app.inject({
      method: 'GET',
      url: '/internal/curriculum',
      headers: serviceAuthHeadersForBody('svc-agents', SECRET, ''),
    });
    expect(ok.statusCode).toBe(200);
    const body = ok.json() as ReturnType<typeof coachSpinePayload>;
    expect(coachSpineIsComplete(body)).toBe(true);
    expect(body.licensedLibraryImported).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/"body"/);

    const mismatch = await app.inject({
      method: 'GET',
      url: '/internal/curriculum',
      headers: serviceAuthHeadersForBody('svc-agents', SECRET, '{"not":"empty"}'),
    });
    expect(mismatch.statusCode).toBe(401);

    await app.close();
  });

  it('require mode 401s a v1 caller that did not bind the empty body', async () => {
    const app = Fastify();
    registerInternalCurriculumRoute(app, SECRET, 'require');
    await app.ready();
    const v1 = await app.inject({
      method: 'GET',
      url: '/internal/curriculum',
      headers: serviceAuthHeaders('svc-agents', SECRET),
    });
    expect(v1.statusCode).toBe(401);
    await app.close();
  });

  it('index mounts the internal curriculum door', () => {
    const index = readFileSync(join(ROOT, 'services/svc-academy/src/index.ts'), 'utf8');
    expect(index).toMatch(/registerInternalCurriculumRoute/);
    expect(index).toMatch(/INTERNAL_SERVICE_SECRET/);
    expect(index).toMatch(/INTERNAL_SERVICE_BODY_BIND/);
  });
});
