/**
 * Unit card — every refusal string written in production is in the catalog
 * 1. Promise: refusal codes are the wire vocabulary (channel.ts); no free-text
 *    status reasons
 * 2. Break: a settle/refuse writes `channel.foo` not listed in allRefusalCodes
 * 3. Done bar: static scan of production sources ⊆ allRefusalCodes()
 * 4. Class N
 * 5. Paths: svc-notify
 * 6. RED: pin
 * 7. Collision: none (read-only pin; open PRs that ADD codes must update catalog)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allRefusalCodes } from './channels/channel.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Production files that write refusal codes onto delivery rows or outcomes. */
const WRITE_SOURCES = [
  'dispatch.ts',
  'channel-store.ts',
  'notify-service.ts',
  'channels/gateway.ts',
  'channels/registry.ts',
  'channels/adapters.ts',
  'preferences/mute.ts',
] as const;

function extractChannelCodes(source: string): string[] {
  const found = new Set<string>();
  for (const m of source.matchAll(/'channel\.[a-z0-9_]+'/g)) {
    found.add(m[0]!.slice(1, -1));
  }
  for (const m of source.matchAll(/"channel\.[a-z0-9_]+"/g)) {
    found.add(m[0]!.slice(1, -1));
  }
  return [...found].sort();
}

describe('refusal write catalog — no dark codes on the wire', () => {
  it('every channel.* literal written in production is on allRefusalCodes()', () => {
    const catalog = new Set(allRefusalCodes());
    const written = new Set<string>();
    for (const rel of WRITE_SOURCES) {
      const src = readFileSync(join(here, rel), 'utf8');
      for (const code of extractChannelCodes(src)) written.add(code);
    }
    // Definition list itself lives in channel.ts — exclude pure type/list files.
    const dark = [...written].filter((c) => !catalog.has(c as typeof allRefusalCodes extends () => readonly (infer U)[] ? U : never));
    expect(dark, `codes written but missing from catalog: ${dark.join(', ')}`).toEqual([]);
  });

  it('catalog stays non-empty and includes the load-bearing set', () => {
    const codes = allRefusalCodes();
    expect(codes.length).toBeGreaterThanOrEqual(9);
    for (const required of [
      'channel.not_configured',
      'channel.no_target',
      'channel.target_unverified',
      'channel.disabled',
      'channel.muted',
      'channel.attempts_exhausted',
      'channel.register_rate_limited',
      'channel.verify_rate_limited',
    ] as const) {
      expect(codes).toContain(required);
    }
  });
});
