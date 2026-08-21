import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = () => readFileSync(join(here, '..', 'index.ts'), 'utf8');

describe('internal curriculum mount', () => {
  it('index registers coach S2S route at boot', () => {
    const src = indexSrc();
    expect(src).toContain('registerInternalCurriculumRoute');
  });

  it('exports stable path for svc-agents coach source', () => {
    expect('/internal/curriculum').toBe('/internal/curriculum');
  });
});
