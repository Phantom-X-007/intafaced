import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `assets.decimals` IS DECLARED AND READ BY NOTHING (STOP §4.2b #5).
 *
 * This test asserts the absence, which is unusual, so here is why it earns its
 * place.
 *
 * The column arrived with 0000 and 0004 stated that it is "the scale the ledger
 * reconciles the asset at, and it is not cosmetic". That reads as a safety
 * property, and an auditor — human or agent — would reasonably conclude the book
 * enforces per-asset scale. It does not. Balances are `numeric(38,18)`,
 * `runReconciliation` compares at 18 decimal places for every asset, and
 * `mulBps` rounds `ceil` at 18 dp, so a fee on a 2 dp fiat leaves a remainder
 * below the asset's own smallest unit that no rail can move and no
 * reconciliation reports.
 *
 * Two failure modes, and this test is aimed at the second:
 *
 *   1. Someone believes the claim and does not check. The comments are corrected
 *      now, which handles that.
 *   2. Someone wires the column later, in the natural place — a rounding step
 *      in a fee recipe or a payout — WITHOUT deciding where the sub-unit
 *      remainder goes. That is a fee policy with a house account and a
 *      user-visible consequence, and it is the kind of decision that gets made
 *      by accident inside a three-line diff.
 *
 * So the moment any production code reads `decimals`, this test fails and says
 * what has to be decided first. It is a tripwire on an open product question,
 * not a rule about the column.
 *
 * Deleting this test is a legitimate move — once the policy exists and is
 * written down, it should go.
 */

const here = dirname(fileURLToPath(import.meta.url));
const svcRoot = join(here, '..', '..');
const repoRoot = join(svcRoot, '..', '..');

/** Source files that could read the column, excluding tests and this file. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...sourceFiles(path));
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.test.ts')) continue;
    out.push(path);
  }
  return out;
}

describe('assets.decimals — declared, and enforced by nothing', () => {
  it('is read by no production code in svc-ledger or ledger-client', () => {
    const files = [...sourceFiles(join(svcRoot, 'src')), ...sourceFiles(join(repoRoot, 'packages', 'ledger-client', 'src'))];

    const readers = files.filter((path) => {
      const body = readFileSync(path, 'utf8');
      // Strip block and line comments: the column is DISCUSSED at length in
      // schema.ts and reconcile.ts, and discussing it is the honest state. Only
      // an expression that actually uses the value counts as a read.
      const code = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      // The declaration itself is not a read.
      const withoutDeclaration = code.replace(/decimals:\s*integer\('decimals'\)[^,]*,/g, '');
      return /\bdecimals\b/.test(withoutDeclaration);
    });

    expect(readers.map((p) => p.replace(repoRoot + '/', ''))).toEqual([]);
  });

  it('every seeded scale is one the ledger could not currently honour', () => {
    // The concrete consequence, pinned: `numeric(38,18)` and 18-dp
    // reconciliation mean the seeds below are aspirations. If the storage scale
    // ever stops being 18, this expectation is the thing that should be revisited.
    const migrations = readdirSync(join(svcRoot, 'drizzle')).filter((f) => f.endsWith('.sql') && !f.endsWith('.down.sql'));

    const seeded = migrations
      .flatMap((f) => readFileSync(join(svcRoot, 'drizzle', f), 'utf8').split('\n'))
      .map((line) => /^\s*\('([A-Z0-9]+)',\s*'[a-z]+',\s*(\d+)\)/.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => ({ asset: m[1]!, decimals: Number(m[2]) }));

    expect(seeded.length).toBeGreaterThan(5);

    // At least one asset is seeded below the storage scale — which is what makes
    // the unenforced column a real gap rather than a tidy no-op.
    expect(seeded.some((s) => s.decimals < 18)).toBe(true);

    // And every scale is within what numeric(38,18) can represent, so nothing
    // seeded is unrepresentable — the gap is dust, not overflow.
    for (const { asset, decimals } of seeded) {
      expect(decimals, `${asset} declares more precision than the ledger stores`).toBeLessThanOrEqual(18);
    }
  });
});
