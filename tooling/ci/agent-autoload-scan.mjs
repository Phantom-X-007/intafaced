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

if (problems.length) {
  console.error('\n✖ agent-autoload-scan failed — cold agents would lose multi-dev law:\n');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nFix the named files. Do not remove coordination from AGENTS.md/CLAUDE.md.\n');
  process.exit(1);
}

console.log('✓ agent-autoload-scan: AGENTS + CLAUDE + AGENT_PROTOCOL + layers + internet leverage intact');
process.exit(0);
