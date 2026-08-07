#!/usr/bin/env node
/**
 * MUTATION TEST for the money property suite.
 *
 * WHY THIS EXISTS
 *
 * Same argument as `secret-scan.mutation.mjs`, one layer down: a green test
 * suite is indistinguishable from a suite that asserts nothing interesting.
 * Property tests are especially good at looking rigorous while being weak —
 * `floor <= half-up <= ceil` reads like a strong claim about rounding and is
 * satisfied by an implementation that ignores its rounding argument entirely.
 *
 * That is not hypothetical. When `money.property.test.ts` was first written it
 * caught 3 of these mutants. Three real defects — a `mulBps` that ignores the
 * caller's rounding mode, a `parseAmount` that truncates over-precision instead
 * of refusing it, and a `proRata` that hands dust to the SMALLEST remainders —
 * sailed through a suite of eighteen passing properties. The properties were
 * strengthened until all six died. Without this file that gap would have
 * shipped as "the money primitives have property tests".
 *
 * A SEVENTH was added on 2026-08-07, and it is the one this harness could not
 * previously have caught — not because the mutant was missing, but because the
 * SUITE'S INPUT DOMAIN was narrower than the function's. The weight generator
 * could not produce a zero weight (`min: 1n`), and the two properties that
 * constrain allocation both ran on positive totals only. `proRata`'s sign
 * blindness lived exactly in that intersection, so no number of runs could
 * reach it. A mutation gate proves the properties are strong; it cannot prove
 * they are pointed at the whole input space, and that is where this one hid.
 *
 * A mutant is KILLED if `vitest run` exits non-zero with it applied.
 *
 * Every mutation is a plausible defect, not a syntax error: each one leaves
 * `money.ts` compiling and every example-based test in `money.test.ts` passing.
 * A mutant that breaks the build proves nothing about the properties.
 *
 * Usage:  pnpm scan:money-property:mutate
 * Exit 0 = every mutant died. Exit 1 = a survivor, i.e. a blind spot.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PKG = join(ROOT, 'packages', 'ledger-client');
const SRC = join(PKG, 'src', 'money.ts');
const BACKUP = join(PKG, 'src', 'money.ts.mutation-backup');
const SUITE = 'src/money.property.test.ts';

/**
 * Each mutant: a defect a reviewer could plausibly miss, and the invariant that
 * must notice it. `find` must appear EXACTLY ONCE in money.ts — a pattern that
 * stops matching after a refactor would silently score as a skip, so a miss is
 * an error here rather than a shrug.
 */
const MUTANTS = [
  {
    name: 'proRata: leftover dust is never redistributed',
    guards: 'conservation — shares must sum to exactly the total',
    find: 'for (const { index } of remainders) {',
    replace: 'for (const { index } of remainders.slice(0, 0)) {',
  },
  {
    name: 'proRata: dust goes to the smallest remainders',
    guards: 'largest-remainder fairness',
    find: 'return ma === mb ? a.index - b.index : mb > ma ? 1 : -1;',
    replace: 'return ma === mb ? a.index - b.index : mb > ma ? -1 : 1;',
  },
  {
    /**
     * The seventh mutant, and the one this gate could not previously have had.
     *
     * Sorting raw remainders instead of their magnitude is the real defect that
     * shipped: on a NEGATIVE total every remainder is negative except a zero
     * weight's, whose remainder is exactly `0` and therefore sorts first, so
     * participants entitled to nothing were paid before those weighted 7 and 5.
     * Conservation still held — the shares summed back to the total exactly —
     * which is why every property in the suite passed over it.
     *
     * This mutant is the pre-fix line, verbatim. It stays here so the sign
     * blindness cannot come back silently: it is only killable because the
     * weight generator now DRAWS zero as its own branch and the allocation
     * properties run on `anyAmount()`. Narrow either of those again and this
     * mutant survives, which is the alarm.
     */
    name: 'proRata: dust ordered by raw remainder, so a negative total pays zero weights first',
    guards: 'a zero weight receives exactly zero, on a total of either sign',
    find: 'return ma === mb ? a.index - b.index : mb > ma ? 1 : -1;',
    replace: 'return a.remainder === b.remainder ? a.index - b.index : b.remainder > a.remainder ? 1 : -1;',
  },
  {
    name: 'divideScaled: half-up boundary loses the exact half',
    guards: 'half-up rounds a true half away from zero',
    find: 'if (r * 2n >= d) q += 1n;',
    replace: 'if (r * 2n > d) q += 1n;',
  },
  {
    name: 'mulBps: caller rounding ignored, always floors',
    guards: 'the rounding argument is obeyed when inexact',
    find: 'divideScaled(amount * BigInt(bps), 10_000n, rounding)',
    replace: "divideScaled(amount * BigInt(bps), 10_000n, 'floor')",
  },
  {
    name: 'formatAmount: trailing zeros left on the wire',
    guards: 'canonical output — a second format changes nothing',
    find: ".replace(/0+$/, '')",
    replace: '',
  },
  {
    name: 'parseAmount: over-precision truncated instead of refused',
    guards: 'MoneyError specifically, not merely "something threw"',
    find: 'throw new MoneyError(`Amount "${input}" has ${frac.length} decimal places; the ledger carries ${DECIMALS}`);',
    replace: 'frac = frac.slice(0, DECIMALS);',
  },
];

copyFileSync(SRC, BACKUP);
const original = readFileSync(BACKUP, 'utf8');

let killed = 0;
const survivors = [];

try {
  for (const mutant of MUTANTS) {
    const occurrences = original.split(mutant.find).length - 1;
    if (occurrences !== 1) {
      console.error(`\n✖ mutation "${mutant.name}" matches money.ts ${occurrences} time(s), expected exactly 1.`);
      console.error('  money.ts changed shape. Re-point the mutation rather than deleting it.\n');
      process.exit(1);
    }

    writeFileSync(SRC, original.replace(mutant.find, mutant.replace));

    const run = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'vitest', 'vitest.mjs'), 'run', SUITE], {
      cwd: PKG,
      encoding: 'utf8',
    });

    if (run.status === 0) {
      survivors.push(mutant);
      console.log(`  SURVIVED  ${mutant.name}`);
      console.log(`            should have been caught by: ${mutant.guards}`);
    } else {
      killed++;
      console.log(`  killed    ${mutant.name}`);
    }
  }
} finally {
  // The suite is worthless if this file leaves a mutation behind, so restore
  // runs even on a throw or a failed assertion above.
  writeFileSync(SRC, original);
  rmSync(BACKUP, { force: true });
}

console.log(`\n${killed}/${MUTANTS.length} mutants killed by ${SUITE}`);

if (survivors.length > 0) {
  console.error('\n✖ A surviving mutant is a blind spot, not a passing test.');
  console.error('  Strengthen the property named beside each survivor above.\n');
  process.exit(1);
}

console.log('✓ every planted money defect was caught by a property\n');
