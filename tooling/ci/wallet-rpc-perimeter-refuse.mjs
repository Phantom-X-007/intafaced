#!/usr/bin/env node
/**
 * WALLET RPC CONTINUOUS PERIMETER REFUSE SUITE — D26-P2-09.
 *
 * Done bar: mainnet / sign / width refuse classes stay refused; regression suite.
 *
 * `wallet-rpc-mainnet-scan.mjs` already walks the tree, freezes constants, and
 * runs RULE_PROBES. What this file adds is the question that harness cannot ask
 * about its own class grouping:
 *
 *   · Does each refuse class (mainnet, sign, width) still have both a firing
 *     probe and a silent probe whose anchors still apply?
 *   · If the class register, the class counters, or a class's rule binding are
 *     deleted, does the build go red — or does a green summary keep saying
 *     continuous refuse held?
 *
 * Subject-side RULE_PROBES already answer "does M3 still fire on ChainId.NONE".
 * This suite mutates the CHECKER, the same way `wallet-rpc-mainnet-scan.mutation.mjs`
 * does for the probe harness and occurrence drift, scoped to the three perimeter
 * classes the board names.
 *
 * Usage:  pnpm scan:wallet-rpc-perimeter
 * Exit 0 = control scan clean, every class deletion detected, every class still
 *          has both probe halves in source.
 * Exit 1 = a class went unproved, a mutant no longer applies, or control is red.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCAN = resolve(HERE, 'wallet-rpc-mainnet-scan.mjs');
const REPO = resolve(HERE, '..', '..');

const SOURCE = readFileSync(SCAN, 'utf8');

/**
 * Probe regions used for the source-level fires/silent half check.
 * mainnet region covers M1+M2 (+ M4/M8 sit later — M1+M2 alone already carry
 * both halves; the half-check is a floor, not a census of every rule id).
 */
const CLASS_PROBE_REGIONS = [
  {
    id: 'mainnet',
    from: '  // ── M1: mainnet network-parameter selectors (D26-P2-09) ─────────────────',
    to: '  // ── M3: the shapes arity alone does not catch ──────────────────────────',
  },
  {
    id: 'sign',
    from: '  // ── M3: the shapes arity alone does not catch ──────────────────────────',
    to: '  // ── M8: an EVM address pinned in Java ──────────────────────────────────',
  },
  {
    id: 'width',
    from: '  // ── M11: fixed-width hex by role ────────────────────────────────────────',
    to: '];\n\n/**\n * Runs every probe and RETURNS the sentence',
  },
];

/**
 * @typedef {object} Mutant
 * @property {string}  id
 * @property {string}  [from]
 * @property {string}  [to]
 * @property {string}  [replace]
 * @property {boolean} detected
 * @property {string}  why
 */

/** @type {Mutant[]} */
const MUTANTS = [
  {
    id: 'control',
    detected: false,
    why: 'unmutated scan must pass — otherwise every "detected" below is a broken file',
  },
  {
    id: 'perimeter-register-emptied',
    from: 'const PERIMETER_CLASSES = [',
    to: 'const RULE_PROBES = [',
    replace: 'const PERIMETER_CLASSES = [];\n\n',
    detected: true,
    why: 'emptying the class register must fail — continuous refuse claimed with zero classes is a sentence about nothing',
  },
  {
    id: 'perimeter-counters-removed',
    from: '    // Continuous perimeter (D26-P2-09): count held assertions into the refuse',
    to: '    // Verdict assertions, where the probe states one.',
    detected: true,
    why: 'deleting the per-class counters leaves claim("perimeter") unminted (or minted from zeros) while probes still pass',
  },
  {
    id: 'perimeter-claim-mint-removed',
    from: "  establish('perimeter',",
    to: '  return (',
    detected: true,
    why: 'summary still consumes claim("perimeter"); removing the mint must go red',
  },
  {
    id: 'class-mainnet-unbound',
    from: "    rules: ['M1', 'M2', 'M4-address', 'M4-endpoint', 'M4-topic', 'M8'],",
    to: "\n  },\n  {\n    id: 'sign',",
    replace: "    rules: ['__perimeter_unbound__'],",
    detected: true,
    why: 'mainnet refuse unbound from every live rule — continuous perimeter must notice',
  },
  {
    id: 'class-sign-unbound',
    from: "    rules: ['M3'],",
    to: "\n  },\n  {\n    id: 'width',",
    replace: "    rules: ['__perimeter_unbound__'],",
    detected: true,
    why: 'sign refuse unbound — chain-id-less signing no longer counted into the class',
  },
  {
    id: 'class-width-unbound',
    from: "    rules: ['M11', 'M11-known'],",
    to: '\n];\n\nconst RULE_PROBES = [',
    replace: "    rules: ['__perimeter_unbound__'],",
    detected: true,
    why: 'width refuse unbound — M11/M11-known no longer counted into the class',
  },
];

/**
 * Source-level proof that each class still declares both probe halves.
 * Mutants catch deletion-at-runtime; this catches a quiet edit that leaves the
 * block present but strips every `fires: true` or every `fires: false`.
 */
function assertClassProbeHalvesInSource() {
  const problems = [];
  for (const c of CLASS_PROBE_REGIONS) {
    const start = SOURCE.indexOf(c.from);
    const end = start === -1 ? -1 : SOURCE.indexOf(c.to, start + c.from.length);
    if (start === -1 || end === -1) {
      problems.push(`[${c.id}] probe region anchors missing — suite cannot prove the class`);
      continue;
    }
    const region = SOURCE.slice(start, end);
    const fireTrue = (region.match(/fires:\s*true/g) ?? []).length;
    const fireFalse = (region.match(/fires:\s*false/g) ?? []).length;
    if (fireTrue < 1 || fireFalse < 1) {
      problems.push(
        `[${c.id}] needs ≥1 fires:true and ≥1 fires:false in its probe region ` + `(found ${fireTrue} true / ${fireFalse} false)`,
      );
    }
  }
  if (problems.length > 0) {
    console.error('\n✖ wallet-rpc-perimeter-refuse — a refuse class lost a probe half in source:\n');
    for (const p of problems) console.error(`  · ${p}`);
    console.error('');
    process.exit(1);
  }
}

assertClassProbeHalvesInSource();

const root = mkdtempSync(join(tmpdir(), 'wallet-rpc-perimeter-refuse-'));

/** @type {string[]} */
const inapplicable = [];

function mutate(m) {
  if (m.from === undefined) return SOURCE;

  const start = SOURCE.indexOf(m.from);
  if (start === -1) {
    inapplicable.push(`[${m.id}] \`from\` anchor missing:\n        ${m.from.split('\n')[0]}`);
    return null;
  }
  if (SOURCE.indexOf(m.from, start + 1) !== -1) {
    inapplicable.push(`[${m.id}] \`from\` anchor is not unique:\n        ${m.from.split('\n')[0]}`);
    return null;
  }
  const end = SOURCE.indexOf(m.to, start + m.from.length);
  if (end === -1) {
    inapplicable.push(`[${m.id}] \`to\` anchor missing after \`from\`:\n        ${m.to.split('\n').filter(Boolean)[0]}`);
    return null;
  }
  return SOURCE.slice(0, start) + (m.replace ?? '') + SOURCE.slice(end);
}

function runScan(source, id) {
  const file = join(root, `${id}.mjs`);
  writeFileSync(file, source, 'utf8');
  const run = spawnSync(process.execPath, [file], { cwd: REPO, encoding: 'utf8' });
  return { code: run.status, out: `${run.stdout ?? ''}${run.stderr ?? ''}` };
}

const survivors = [];
const brokenControl = [];

try {
  for (const m of MUTANTS) {
    const source = mutate(m);
    if (source === null) continue;
    const { code, out } = runScan(source, m.id);
    const detected = code !== 0;
    if (detected === m.detected) continue;
    if (m.detected) survivors.push({ ...m, out });
    else brokenControl.push({ ...m, out });
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

const scored = MUTANTS.filter((m) => m.detected);
const killed = scored.length - survivors.length;

if (inapplicable.length > 0) {
  console.error('\n✖ mutants that no longer apply — anchors moved; these assertions ran on nothing:\n');
  for (const i of inapplicable) console.error(`  ${i}\n`);
}

if (brokenControl.length > 0) {
  console.error('\n✖ unmutated scan does not pass — nothing below can be trusted:\n');
  for (const m of brokenControl) console.error(`  [${m.id}]\n${m.out}\n`);
}

if (survivors.length > 0) {
  console.error(`\n✖ ${survivors.length} perimeter deletion(s) went UNDETECTED:\n`);
  for (const m of survivors) {
    console.error(`  [${m.id}]  ${m.why}`);
    console.error(`    exited 0; last line: ${(m.out.trim().split('\n').slice(-1)[0] ?? '').slice(0, 240)}\n`);
  }
}

if (inapplicable.length > 0 || brokenControl.length > 0 || survivors.length > 0) process.exit(1);

console.log(
  `✓ wallet-rpc-perimeter-refuse — ${killed}/${scored.length} class/register deletions detected; ` +
    'mainnet/sign/width each keep fires+silent halves; control scan clean (D26-P2-09)',
);
