/**
 * Unit card — TRADE_ALGO_JOBS_ENABLED stays default OFF
 * 1. Promise: child TWAP ticks do not fire unless an operator denylist-enables jobs
 * 2. Break: `.default(true)` or `enabled: true` in the host would slice on a clean deploy
 * 3. Done bar: env default false + denylist; startAlgoJobs short-circuits; no tickAllAlgos
 * 4. Class N
 * 5. Paths: svc-trade/src/algo + env.ts / index.ts source pins (read-only)
 * 6. RED: TRADE_ALGO_JOBS_ENABLED default true, or disabled host still calls tickAllAlgos
 * 7. Collision: none — does not invent VWAP/POV; tracker stays residual
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { startAlgoJobs } from './algo-jobs.js';

const here = dirname(fileURLToPath(import.meta.url));
const joinChains = (source: string) => source.replace(/\n\s*\./g, '.');
const envSrc = joinChains(readFileSync(join(here, '..', 'env.ts'), 'utf8'));
const indexSrc = readFileSync(join(here, '..', 'index.ts'), 'utf8');
const jobsSrc = readFileSync(join(here, 'algo-jobs.ts'), 'utf8');

describe('TRADE_ALGO_JOBS_ENABLED cannot sneak default ON', () => {
  it('env schema defaults the jobs flag false (unset deploy places no children)', () => {
    const decl = /TRADE_ALGO_JOBS_ENABLED:\s*(z\.[^\n]*)/.exec(envSrc);
    expect(decl, 'TRADE_ALGO_JOBS_ENABLED is not declared in svc-trade/src/env.ts').not.toBeNull();
    expect(decl![1]).toContain('.default(false)');
    expect(decl![1]).not.toContain('.default(true)');
  });

  it('only denylist strings enable jobs — empty / 0 / false stay off', () => {
    const decl = /TRADE_ALGO_JOBS_ENABLED:\s*(z\.[^\n]*)/.exec(envSrc);
    expect(decl![1]).toMatch(
      /\.transform\(\(v\)\s*=>\s*\(typeof v === 'boolean' \? v : \['1', 'true', 'on', 'yes'\]\.includes\(v\.toLowerCase\(\)\)\)\)/,
    );
  });

  it('live host wires startAlgoJobs from the env flag, not a literal true', () => {
    expect(indexSrc).toMatch(/startAlgoJobs\(\{[\s\S]*enabled:\s*env\.TRADE_ALGO_JOBS_ENABLED/);
    expect(indexSrc).not.toMatch(/startAlgoJobs\(\{[\s\S]*enabled:\s*true/);
  });

  it('scheduler returns before registering algo.twap when enabled is falsy', () => {
    const enabledCheck = jobsSrc.indexOf('if (!deps.config.enabled)');
    const register = jobsSrc.indexOf("host.every('algo.twap'");
    expect(enabledCheck).toBeGreaterThan(-1);
    expect(register).toBeGreaterThan(enabledCheck);
  });

  it('default-OFF handle never calls tickAllAlgos even after the interval elapses', async () => {
    vi.useFakeTimers();
    try {
      const trade = { tickAllAlgos: vi.fn(async () => undefined) };
      const handle = startAlgoJobs({ trade, config: { enabled: false, intervalMs: 250 } });
      expect(handle.host.list()).toEqual([]);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(trade.tickAllAlgos).not.toHaveBeenCalled();
      handle.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
