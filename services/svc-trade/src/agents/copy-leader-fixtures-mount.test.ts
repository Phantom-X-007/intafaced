import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COPY_LEADER_FIXTURES_PATH } from './copy-leader-fixtures-routes.js';

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = () => readFileSync(join(here, '..', 'index.ts'), 'utf8');

describe('copy leader fixtures mount', () => {
  it('index registers S2S route at boot', () => {
    const src = indexSrc();
    expect(src).toContain('registerCopyLeaderFixturesRoutes');
    expect(src).toContain('internalSecret: env.INTERNAL_SERVICE_SECRET');
  });

  it('exports stable path for svc-agents HTTP port', () => {
    expect(COPY_LEADER_FIXTURES_PATH).toBe('/internal/agents/copy-leader-fixtures');
  });
});
