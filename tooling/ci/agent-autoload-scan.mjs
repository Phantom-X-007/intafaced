#!/usr/bin/env node
/**
 * AGENT AUTOLOAD SCAN
 *
 * Ensures multi-dev coordination law stays in the files cold agents load
 * WITHOUT Nitro pasting a session prompt.
 *
 * Does NOT require features.mjs on every PR. Does NOT add human Approves.
 * Fails only if the auto-load entry chain is broken (regression of the law).
 *
 * Run: node tooling/ci/agent-autoload-scan.mjs
 * Wired: pnpm scan:agent-autoload · CI doctrine gates · pnpm verify
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const problems = [];

function read(rel) {
  const p = join(ROOT, rel);
  if (!existsSync(p)) {
    problems.push(`missing required auto-load file: ${rel}`);
    return '';
  }
  return readFileSync(p, 'utf8');
}

function mustInclude(rel, needle, why) {
  const body = read(rel);
  if (!body) return;
  if (!body.toLowerCase().includes(String(needle).toLowerCase())) {
    problems.push(`${rel}: missing ${JSON.stringify(needle)} — ${why}`);
  }
}

// Primary auto-load for Grok / multi-agent tools
mustInclude('AGENTS.md', 'COORDINATION-TRUTH-LAYERS', 'cold agents must inherit multi-dev layers without a paste prompt');
mustInclude('AGENTS.md', 'mountain events', 'must not regress to every-PR registry tax or drop claim law');

// Claude Code auto-loads CLAUDE.md first
mustInclude('CLAUDE.md', 'AGENTS.md', 'Claude sessions must chain into AGENTS.md');
mustInclude('CLAUDE.md', 'COORDINATION-TRUTH-LAYERS', 'Claude cold start must see coordination without Nitro paste');

// Hard-ban file every agent is told to read
mustInclude('tooling/agent-protocol/AGENT_PROTOCOL.md', 'COORDINATION-TRUTH-LAYERS', 'protocol hard path must name the layers home');
mustInclude('tooling/agent-protocol/AGENT_PROTOCOL.md', 'HUMAN-CLAIMED', 'must hard-ban implementing shehzad/human mountains');

// Law home itself
mustInclude('docs/COORDINATION-TRUTH-LAYERS.md', 'No PR cap', 'anti-limit guarantees must stay in the law home');
mustInclude('docs/COORDINATION-TRUTH-LAYERS.md', 'mountain events', 'mountain-events-only rule must stay');

// Internet leverage — Phase A reuse (cold agents must not rebuild kit/ledger by default)
mustInclude('AGENTS.md', 'INTERNET-LEVERAGE-LAW', 'cold agents must load internet leverage law without Nitro paste');
mustInclude('AGENTS.md', 'Internet leverage law', 'mandatory section must stay visible in AGENTS.md');
mustInclude('CLAUDE.md', 'INTERNET-LEVERAGE-LAW', 'Claude cold start must inherit leverage law');
mustInclude(
  'tooling/agent-protocol/AGENT_PROTOCOL.md',
  'INTERNET-LEVERAGE-LAW',
  'protocol hard path must require leverage before product code',
);
mustInclude('tooling/agent-protocol/AGENT_PROTOCOL.md', 'second money book', 'must hard-ban second book / rebuild kit class failures');
mustInclude('docs/INTERNET-LEVERAGE-LAW.md', 'Phase A is finished for NOW', 'leverage law home must keep operator decision');
mustInclude('docs/INTERNET-LEVERAGE-LAW.md', 'Mandatory pre-code ritual', 'agents need an executable ritual not a vague blog');

// Session finish — the definition of "done" for a RUN, not a module.
// Until 2026-08-07 this lived only at ~/projects/OS/harvest/shared/S-CORE.md while
// SWARM-MANDATE cited it as binding: Denon, Shehzad, CI and any other machine could
// not read it. Module Done (AGENT_PROTOCOL §8) is satisfiable infinitely — 64 PRs and
// 21k lines of catalog copies passed it — so an unreachable session-finish definition
// is what let the mill run. The ontology stays in-repo and stays cited.
mustInclude('docs/ops/FINISH-ONTOLOGY.md', 'F-STANDBY', 'session finish types must stay in the repo, readable by every teammate');
mustInclude('docs/ops/FINISH-ONTOLOGY.md', 'never evidence of success', 'the noise bans are the anti-volume rule; do not drop them');
mustInclude('docs/ops/SWARM-MANDATE.md', 'FINISH-ONTOLOGY', 'the mandate must cite the in-repo ontology, never a path on one machine');

// Binding law may not delegate authority to a path outside the repo. Same class as the
// four reachability failures of 2026-08-07: correct doctrine no teammate can reach is
// doctrine that does not exist. Operational paths an agent execs (tokens, tool bins)
// are not authority claims and are skipped.
for (const rel of ['AGENTS.md', 'docs/ops/SWARM-MANDATE.md', 'docs/COORDINATION-TRUTH-LAYERS.md', 'docs/ops/FINISH-ONTOLOGY.md']) {
  const body = read(rel);
  if (!body) continue;
  for (const line of body.match(/^.*(?:~\/projects\/|OS harvest|\/Users\/[A-Za-z0-9._-]+\/projects\/).*$/gm) || []) {
    if (/agent-auth|\.tools\/bin|token/i.test(line)) continue;
    problems.push(
      `${rel}: cites law outside the repo — "${line.trim().slice(0, 80)}". Move it in-repo; teammates cannot read one machine's disk.`,
    );
  }
}

if (problems.length) {
  console.error('\n✖ agent-autoload-scan failed — cold agents would lose multi-dev law:\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nFix the named files. Do not remove coordination from AGENTS.md/CLAUDE.md.\n');
  process.exit(1);
}

console.log('✓ agent-autoload-scan: AGENTS + CLAUDE + AGENT_PROTOCOL + layers + internet leverage intact');
process.exit(0);
