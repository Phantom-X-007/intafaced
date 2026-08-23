/**
 * Unit card — live boot injects PostgresChainWatcherCursorStore
 *
 * 1. Promise: a crashed watcher does not POST the same inbound twice.
 * 2. Break: CryptoChainWatcher() with no store → Memory cursor; crash
 *    re-drains and double-POSTs. Without mnemonic, a live watcher must
 *    never start (would invent deposits).
 * 3. Done bar: index.ts constructs PostgresChainWatcherCursorStore(sql)
 *    and passes it as cursorStore. Watcher starts only behind EvmLiveChain.
 * 4. Class M
 * 5. Paths: services/svc-pay/src/index.ts (boot only)
 * 6. RED: pin fails if the durable cursor is not the boot journal, or if
 *    the watcher can start on MemoryChain / UnconfiguredChain
 * 7. Collision: none — this pin only reads index.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = readFileSync(join(here, 'index.ts'), 'utf8');

describe('boot wires PostgresChainWatcherCursorStore', () => {
  it('constructs the durable cursor and injects it into CryptoChainWatcher', () => {
    expect(indexSrc).toMatch(/import \{ CryptoChainWatcher, PostgresChainWatcherCursorStore \} from '\.\/rails\/chain-watcher\.js'/);
    expect(indexSrc).toMatch(/const watcherCursors = new PostgresChainWatcherCursorStore\(sql\)/);
    expect(indexSrc).toMatch(/cursorStore:\s*watcherCursors/);
  });

  it('does not fall back to MemoryChainWatcherCursorStore at boot', () => {
    expect(indexSrc).not.toMatch(/new MemoryChainWatcherCursorStore\s*\(/);
  });

  it('starts the watcher only behind EvmLiveChain — no mnemonic, no invented deposit', () => {
    expect(indexSrc).toMatch(/chain instanceof EvmLiveChain && env\.PAY_CRYPTO_WATCHER_ENABLED === 'true'/);
    expect(indexSrc).not.toMatch(/new CryptoChainWatcher\([\s\S]*MemoryChain/);
    expect(indexSrc).not.toMatch(/new CryptoChainWatcher\([\s\S]*UnconfiguredChain/);
  });
});
