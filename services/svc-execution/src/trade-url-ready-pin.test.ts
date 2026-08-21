import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = () => readFileSync(join(here, 'index.ts'), 'utf8');

describe('execution ready trade snapshot pin', () => {
  it('/ready reports tradeBookSnapshotVenue when TRADE_URL wired', () => {
    const src = indexSrc();
    expect(src).toContain('buildTradeBookSnapshotMap(env.TRADE_URL)');
    expect(src).toContain('tradeBookSnapshotVenue: env.TRADE_URL ? TRADE_BOOK_SNAPSHOT_VENUE_ID : null');
  });
});
