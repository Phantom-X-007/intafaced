import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('pay routing policy import pin', () => {
  it('router imports describeRoutingPolicy once from routing/routing-policy.js', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const routerSource = readFileSync(join(here, 'router.ts'), 'utf8');
    expect(routerSource).toMatch(/from '\.\/routing\/routing-policy\.js'/);
    expect(routerSource).not.toMatch(/from '\.\/routing-policy\.js'/);
  });
});
