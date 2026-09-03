import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dexFeeOwnerEnvComposeGapsClosed, dexInternalBookFeeBpsComposeWired } from './dex-fee-compose-wiring.js';

describe('socket.dex-fee-source fleet compose wiring', () => {
  it('closes CLOB fee + settlement cost + internal-book fee compose gaps', () => {
    expect(dexFeeOwnerEnvComposeGapsClosed()).toBe(true);
  });

  it('compose pins empty internal-book fee (never invent 20)', () => {
    expect(dexInternalBookFeeBpsComposeWired()).toBe(true);
    const compose = readFileSync(new URL('../../../../docker-compose.apps.yml', import.meta.url), 'utf8');
    expect(compose).toMatch(/DEX_INTERNAL_BOOK_FEE_BPS:\s*\$\{DEX_INTERNAL_BOOK_FEE_BPS:-\}/);
    expect(compose).not.toContain('DEX_INTERNAL_BOOK_FEE_BPS: ${DEX_INTERNAL_BOOK_FEE_BPS:-' + '20}');
    const envSource = readFileSync(new URL('../env.ts', import.meta.url), 'utf8');
    expect(envSource).not.toMatch(/DEX_INTERNAL_BOOK_FEE_BPS:[\s\S]{0,280}\.default\(20\)/);
  });
});
