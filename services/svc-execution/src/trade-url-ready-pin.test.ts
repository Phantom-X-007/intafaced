import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

describe('execution ready trade snapshot pin', () => {
  it('/ready reports tradeBookSnapshotVenue as configured + unprobed when TRADE_URL set', () => {
    const index = readFileSync(join(here, 'index.ts'), 'utf8');
    const ready = readFileSync(join(here, 'ready-response.ts'), 'utf8');
    expect(index).toContain('buildTradeBookSnapshotMap(env.TRADE_URL)');
    expect(ready).toContain('tradeBookSnapshotVenue: tradeBookSnapshotHonesty(input.tradeUrl)');
  });
});
