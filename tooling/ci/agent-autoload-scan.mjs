#!/usr/bin/env node
/**
 * AGENT AUTOLOAD SCAN
 *
 * Cold agents must still see money, chain lock, and leverage.
 * This is not a licence to keep a novel in AGENTS.md.
 *
 * Run: node tooling/ci/agent-autoload-scan.mjs
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
mustInclude('AGENTS.md', 'pnpm ledger', 'run ledger still reachable');
mustInclude('AGENTS.md', 'RESUME HERE', 'resume cue');
mustInclude('AGENTS.md', 'open-count', 'run-level done check');

mustInclude('CLAUDE.md', 'AGENTS.md', 'Claude must chain into AGENTS.md');
mustInclude('CLAUDE.md', 'COORDINATION-TRUTH-LAYERS', 'Claude sees layers');
mustInclude('CLAUDE.md', 'INTERNET-LEVERAGE-LAW', 'Claude sees leverage');

mustInclude('tooling/agent-protocol/AGENT_PROTOCOL.md', 'HUMAN-CLAIMED', 'hard-ban shehzad/human mountains');
mustInclude('tooling/agent-protocol/AGENT_PROTOCOL.md', 'INTERNET-LEVERAGE-LAW', 'protocol still names leverage');
mustInclude('tooling/agent-protocol/AGENT_PROTOCOL.md', 'second money book', 'no second book');

mustInclude('docs/INTERNET-LEVERAGE-LAW.md', 'Phase A is finished for NOW', 'operator decision stays');

if (problems.length) {
  console.error('\n✖ agent-autoload-scan failed:\n');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log('✓ agent-autoload-scan: short AGENTS + money/chain/leverage intact');
process.exit(0);
