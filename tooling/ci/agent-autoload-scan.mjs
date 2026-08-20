#!/usr/bin/env node
/**
 * AGENT AUTOLOAD SCAN
 *
 * Cold agents must still see money, chain lock, leverage, and the
 * wait-on-Nitro ban. This is not a licence to keep a swarm novel in AGENTS.md.
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

mustInclude('AGENTS.md', 'ledger-client', 'value must stay in the ledger');
mustInclude('AGENTS.md', 'number', 'money must not be a JS number');
mustInclude('AGENTS.md', 'shehzad', 'chain lock must stay visible');
mustInclude('AGENTS.md', 'INTERNET-LEVERAGE-LAW', 'do not rebuild kit / second book');
mustInclude('AGENTS.md', 'Internet leverage law', 'section name the scan already keys on');
mustInclude('AGENTS.md', 'COORDINATION-TRUTH-LAYERS', 'layers home still exists');
mustInclude('AGENTS.md', 'mountain events', 'tracker is not a per-PR tax');
mustInclude('AGENTS.md', 'pnpm wt', 'worktree law');
mustInclude('AGENTS.md', 'pnpm verify', 'module done');
mustInclude('AGENTS.md', 'audited:true', 'the wait-ban must name the flag');
mustInclude('AGENTS.md', 'do not ping Nitro', 'Shehzad/Denon must not wait on Nitro to code');
mustInclude('AGENTS.md', 'Serial-Work:', 'stamp-mill escape must stay visible');
mustInclude('AGENTS.md', 'named failing job', 'CI diagnosis is the job name, not a Nitro ping');

mustInclude('CLAUDE.md', 'AGENTS.md', 'Claude must chain into AGENTS.md');
mustInclude('CLAUDE.md', 'COORDINATION-TRUTH-LAYERS', 'Claude sees layers');
mustInclude('CLAUDE.md', 'INTERNET-LEVERAGE-LAW', 'Claude sees leverage');

mustInclude('tooling/agent-protocol/AGENT_PROTOCOL.md', 'COORDINATION-TRUTH-LAYERS', 'protocol hard path must name the layers home');
mustInclude('tooling/agent-protocol/AGENT_PROTOCOL.md', 'HUMAN-CLAIMED', 'hard-ban shehzad/human mountains');
mustInclude('tooling/agent-protocol/AGENT_PROTOCOL.md', 'INTERNET-LEVERAGE-LAW', 'protocol still names leverage');
mustInclude('tooling/agent-protocol/AGENT_PROTOCOL.md', 'second money book', 'no second book');
mustInclude('tooling/agent-protocol/AGENT_PROTOCOL.md', 'do not ping Nitro', 'protocol-level wait ban');

mustInclude('docs/COORDINATION-TRUTH-LAYERS.md', 'No PR cap', 'anti-limit guarantees must stay in the law home');
mustInclude('docs/COORDINATION-TRUTH-LAYERS.md', 'mountain events', 'mountain-events-only rule must stay');

mustInclude('docs/INTERNET-LEVERAGE-LAW.md', 'Phase A is finished for NOW', 'operator decision stays');
mustInclude('docs/INTERNET-LEVERAGE-LAW.md', 'Mandatory pre-code ritual', 'agents need an executable ritual not a vague blog');

// Swarm finish ontology stays in-repo for the Nitro coordinator. It must NOT
// be forced into AGENTS.md — that paste was beating partner models.
mustInclude('docs/ops/FINISH-ONTOLOGY.md', 'F-STANDBY', 'session finish types must stay in the repo, readable by every teammate');
mustInclude('docs/ops/FINISH-ONTOLOGY.md', 'never evidence of success', 'the noise bans are the anti-volume rule; do not drop them');
mustInclude('docs/ops/SWARM-MANDATE.md', 'FINISH-ONTOLOGY', 'the mandate must cite the in-repo ontology, never a path on one machine');
mustInclude(
  'tooling/scripts/run-ledger.mjs',
  'cannot be done without a proof link',
  'no-proof-no-done is enforced in code, not by convention',
);

// Binding law may not delegate authority to a path outside the repo.
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
  console.error('\n✖ agent-autoload-scan failed:\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nFix the named files. Do not remove money/chain/leverage/no-wait from AGENTS.md/CLAUDE.md.\n');
  process.exit(1);
}

console.log('✓ agent-autoload-scan: short AGENTS + money/chain/leverage/no-wait intact');
process.exit(0);
