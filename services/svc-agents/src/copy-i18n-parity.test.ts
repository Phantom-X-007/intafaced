/**
 * Done bar: every agents COPY_KEYS entry must exist in packages/i18n EN catalog.
 * Surfaces render from i18n; svc-agents EN is the reference — drift = silent
 * raw keys in the UI.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COPY_KEYS, EN } from './copy.js';

function i18nCatalogSource(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // services/svc-agents/src → repo root → packages/i18n/src/catalog.ts
  return readFileSync(join(here, '../../../packages/i18n/src/catalog.ts'), 'utf8');
}

function i18nAgentKeys(src: string): Set<string> {
  const keys = new Set<string>();
  for (const m of src.matchAll(/^\s*'((?:agents)\.[^']+)':/gm)) {
    keys.add(m[1]!);
  }
  return keys;
}

describe('agents copy ↔ packages/i18n parity', () => {
  it('every COPY_KEYS entry is present in the EN i18n catalog', () => {
    const cat = i18nAgentKeys(i18nCatalogSource());
    const missing = COPY_KEYS.filter((k) => !cat.has(k));
    expect(missing, `missing i18n keys:\n${missing.join('\n')}`).toEqual([]);
  });

  it('every COPY_KEYS entry has EN prose in svc-agents', () => {
    for (const k of COPY_KEYS) {
      expect(EN[k].length).toBeGreaterThan(0);
    }
  });

  it('refused.* keys are never empty (refusal 1:1 Done bar)', () => {
    const refused = COPY_KEYS.filter((k) => k.startsWith('agents.refused.'));
    expect(refused.length).toBeGreaterThanOrEqual(9);
    const cat = i18nAgentKeys(i18nCatalogSource());
    for (const k of refused) {
      expect(cat.has(k), k).toBe(true);
    }
  });
});
