import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NAVIGATOR_SESSION_PATH } from './navigator-session-routes.js';

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = () => readFileSync(join(here, '..', 'index.ts'), 'utf8');

describe('navigator session mount', () => {
  it('index registers S2S route at boot', () => {
    const src = indexSrc();
    expect(src).toContain('registerNavigatorSessionRoutes');
    expect(src).toContain('internalSecret: env.INTERNAL_SERVICE_SECRET');
  });

  it('exports stable path for svc-agents HTTP port', () => {
    expect(NAVIGATOR_SESSION_PATH).toBe('/internal/agents/navigator-session');
  });
});
