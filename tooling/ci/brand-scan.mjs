#!/usr/bin/env node
/**
 * BRAND SCAN — Doctrine §0.7, enforced.
 *
 *   "The onboarding intelligence is the GMaster Neural Engine consumed as an
 *    internal service. User-facing copy references only: Identity Blueprint,
 *    Sovereign Intelligence, Neural Engine. No third-party system names
 *    anywhere in UI, API responses, or docs shipped to users."
 *
 * This scans everything that can reach a user — components, i18n catalogues,
 * API response literals, public docs — for forbidden names.
 *
 * The vendor name is forbidden EVERYWHERE, including inside service code. There
 * is no "internal code may name it" exemption: `services/svc-blueprint/src` is
 * not allowlisted and never has been. The engine is reached through
 * `BLUEPRINT_ENGINE_URL` and a `NeuralEngineClient`, which is enough to call it
 * without naming it.
 *
 * (This comment previously claimed the opposite — that svc-blueprint's source
 * was allowed to reference the vendor. It was never true, and the ALLOWLIST
 * below proves it. A comment that invites you to trust a permission you do not
 * have is worse than no comment. Caught while building svc-blueprint.)
 *
 * The allowlist is deliberately narrow and every entry carries a reason.
 *
 * Exit 0 = clean. Exit 1 = a name would have shipped.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();

/**
 * Names that must never appear in shipped copy. Extend as partners are added
 * (§0.4 adapters: rail and issuer names are internal identifiers, not brands).
 */
const FORBIDDEN = [
  { pattern: /\bGMaster\b/i, reason: 'engine vendor name — say "Neural Engine"' },
  { pattern: /\bG-?Master\s*Neural\b/i, reason: 'engine vendor name' },
  {
    pattern: /\bFincept\b/i,
    reason: 'licensed terminal vendor — the desktop client ships fully rebranded (docs/TERMINAL_INTEGRATION.md §8)',
  },
  { pattern: /\bSettleTX\b/i, reason: 'rail partner name' },
  { pattern: /\bPayKwik\b/i, reason: 'rail partner name' },
  { pattern: /\bNTG\b/, reason: 'rail partner name' },
  { pattern: /\bAnthropic\b/i, reason: 'model provider — agents are "Sovereign Intelligence"' },
  { pattern: /\bClaude\b/i, reason: 'model provider' },
  { pattern: /\bOpenAI\b/i, reason: 'model provider' },
  { pattern: /\bGPT-\d/i, reason: 'model provider' },

  // Third-party exchange provenance. These names carry no product meaning for
  // us, so the only route into the tree is somebody copying in another
  // project's source — which is precisely the moment a demo domain or a
  // stranger's contact address ships to a customer. Added pre-emptively: as of
  // this commit the repo contains none of them, and a guard that costs nothing
  // is worth more than noticing late that support mail points at a person who
  // has never heard of us.
  { pattern: /\bbizzan\b/i, reason: 'third-party exchange vendor identity — also covers BizzanExchange, com.bizzan, bizzan.com' },
  { pattern: /\bbitrade\b/i, reason: 'third-party exchange vendor identity (upstream module prefix)' },
  { pattern: /\bcoinexchange\b/i, reason: 'third-party exchange vendor identity' },
  {
    pattern: /\b(?:877070886|837385225|220806216)@qq\.com\b/i,
    reason: 'upstream author contact address — never ours to publish or point users at',
  },
];

/** Directories never scanned. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.next',
  '.turbo',
  'coverage',
  'drizzle',
  '.docker-data',
  // Third-party source we redistribute rather than author. Its package names,
  // groupIds and entity→table mappings are load-bearing — renaming them to
  // strip a vendor's identity breaks the build it came with. The rule that
  // still applies is §0.7 at the boundary: nothing from here may surface in
  // our UI, API responses or docs unrebranded, and the FORBIDDEN entries above
  // are what catch it if it tries. Note the trade-off this makes: our own code
  // would go unscanned if it were ever parked under a `vendor/` directory.
  // Don't do that.
  'vendor',
]);

/**
 * Paths exempt from the scan, each with a reason. Anything added here is a
 * deliberate, reviewable decision — not a way around the rule.
 */
const ALLOWLIST = [
  { path: 'INTAFACED_DEFINITIVE_BUILD.md', reason: 'the build doctrine itself — internal, never shipped to users' },
  { path: join('tooling', 'ci', 'brand-scan.mjs'), reason: 'this file declares the forbidden names' },
  { path: join('tooling', 'agent-protocol'), reason: 'internal agent rules — not user-facing' },
  { path: 'README.md', reason: 'internal repo README' },
  { path: 'CONTRIBUTING.md', reason: 'internal contributor guide — names the agent tools we actually use' },
  { path: 'AGENTS.md', reason: 'internal agent brief — not shipped to users' },
  { path: '.github', reason: 'internal repo templates and workflows' },
  {
    path: join('docs', 'TERMINAL_INTEGRATION.md'),
    reason: 'internal architecture + licensing record; names the vendor deliberately so the rebrand scope is auditable',
  },
  {
    path: join('docs', 'adr'),
    reason:
      'internal architecture decision records — must be free to name upstream vendors so quarantine and rebrand scope stay auditable (same rationale as TERMINAL_INTEGRATION.md)',
  },
  {
    path: join('docs', 'audit'),
    reason: 'internal audit work product; may cite vendor paths when describing CI/brand failures',
  },
  {
    path: join('docs', 'NITRO-AGENT-PACKAGES-2026-07-30.md'),
    reason:
      'agent work packages; must name the exact shell paths an agent may touch, or the territory boundary is unenforceable and someone edits the wrong stream. Not shipped to users. Remove this entry once the vendor directory is renamed.',
  },
  {
    path: join('docs', 'HANDOVER-2026-07-29.md'),
    reason:
      'internal handover; quotes real on-disk paths and package roots verbatim, which a developer needs in order to act on it. Remove this entry once the vendor directory and Java package root are renamed.',
  },
  {
    path: join('docs', 'STATUS-2026-07-29-EVENING.md'),
    reason:
      'internal status handover; its whole purpose is telling a developer which directory the product lives in, so it must name that path verbatim. Remove this entry once the vendor directory and Java package root are renamed.',
  },
  {
    path: join('docs', 'SPLIT-BOARD.md'),
    reason:
      'internal work split; quotes real worktree paths and the Java package root verbatim. Remove this entry once the vendor directory and Java package root are renamed.',
  },
  {
    path: join('docs', 'LICENCE-POSITION.md'),
    reason:
      'internal licence audit; must name the exact vendor paths and Maven groupIds an unlicensed component sits at, or an engineer cannot act on it without first asking which path was meant. Same rationale as TERMINAL_INTEGRATION.md and docs/adr. Not shipped to users. Remove this entry once the vendor directory and Java package root are renamed.',
  },
  {
    path: join('docs', 'A1.4-WALLET-SECRETS-PERIMETER-2026-07-30.md'),
    reason:
      'internal security work product (board item A1.4); names the exact module and file each committed credential sits in. A finding that says "a password in some properties file" is not actionable — the whole value of the document is that an engineer can go straight to the key and rotate it. Not shipped to users. Remove this entry once the vendor directory and Java package root are renamed.',
  },
  {
    path: join('docs', 'RUNBOOK-ETH-KEYSTORE-REENCRYPTION.md'),
    reason:
      'internal custody runbook; an operator following it must be able to copy the real module paths and MongoDB collection names verbatim. A runbook that paraphrases the path it wants you to act on is how the wrong directory gets re-encrypted. Not shipped to users. Remove this entry once the vendor directory and Java package root are renamed.',
  },
  {
    path: join('docs', 'VENDORED-OVERLAP-AUDIT.md'),
    reason:
      'internal overlap audit; its entire product is a per-capability decision about which vendored module we adopt, rebuild or delete, and that decision cannot be taken against paraphrased paths. It cites the exact controller files whose money paths are in scope, the exact schema the balances sit in, and the exact module jars that are and are not running — the same rationale as docs/adr and LICENCE-POSITION.md. Seven occurrences, all of them a path or a database name an engineer must be able to copy. Not shipped to users. Remove this entry once the vendor directory and Java package root are renamed.',
  },
  {
    path: 'NOTICE',
    reason:
      'root third-party attribution record; an attribution that omits the upstream it attributes is a false legal statement, so this file must name upstreams verbatim. It has no file extension and so currently falls outside EXTENSIONS below — this entry is deliberate belt-and-braces, so that widening EXTENSIONS later cannot silently fail CI on the one file whose whole job is naming upstreams accurately.',
  },
  { path: 'CLAUDE.md', reason: 'internal agent instructions' },
  { path: '.claude', reason: 'internal tooling config' },
  {
    path: join('tooling', 'ci', 'agent-autoload-scan.mjs'),
    reason:
      'internal CI guard that must name auto-load entry files including CLAUDE.md (itself allowlisted). Not user-facing product copy.',
  },
  {
    path: join('docs', 'COORDINATION-TRUTH-LAYERS.md'),
    reason: 'internal multi-dev agent law; must name AGENTS.md/CLAUDE.md auto-load paths. Not shipped to users.',
  },
  {
    path: join('docs', 'COORDINATION-FINISH-AUDIT-2026-08-02.md'),
    reason: 'internal agent finish audit for multi-dev law. Not shipped to users.',
  },
  {
    path: join('docs', 'COORDINATION-STRESS-TEST-USER-CLAIMS-2026-08-02.md'),
    reason: 'internal agent stress-test of multi-dev law. Not shipped to users.',
  },
  {
    path: join('docs', 'TRACKER-COORDINATION-PROPER-PLAN-2026-08-02.md'),
    reason: 'internal planning for multi-dev coordination. Not shipped to users.',
  },
  {
    path: join('docs', 'DENON-TRACKER-TRUTH-AUDIT-2026-08-02.md'),
    reason: 'internal audit of tracker multi-dev intent. Not shipped to users.',
  },
  // Stream A agent law / handoffs — name planner vs implementer roles and on-disk
  // shell paths so territory is enforceable. Not user-facing product copy.
  {
    path: join('docs', 'FRONTEND-MASTER-METHODOLOGY-2026-07-31.md'),
    reason: 'internal Stream A methodology law; must name agent roles and tooling for operators. Not shipped to users.',
  },
  {
    path: join('docs', 'FRONTEND-MASTER-PLAN-WAVE-A-B-2026-07-31.md'),
    reason: 'internal Stream A wave plan; agent/tooling names are process, not product. Not shipped to users.',
  },
  {
    path: join('docs', 'FRONTEND-OPS-NOW-2026-07-30.md'),
    reason: 'internal Stream A ops runbook; names agent runtimes and sandbox limits. Not shipped to users.',
  },
  {
    path: join('docs', 'FRONTEND-AUTONOMOUS-OPERATING-SYSTEM-2026-08-02.md'),
    reason: 'internal AOS architecture for agents. Not shipped to users.',
  },
  {
    path: join('docs', 'FRONTEND-LEVEL-RECOVERY-AND-GO-READY-2026-08-02.md'),
    reason: 'internal go-ready hole-poke for agents. Not shipped to users.',
  },
  {
    path: join('docs', 'FRONTEND-GO-READY-BRIEF-2026-08-02.md'),
    reason: 'internal paste brief for go sessions. Not shipped to users.',
  },
  {
    path: join('docs', 'FRONTEND-STATE-OF-TRUTH-2026-07-31.md'),
    reason: 'internal SoT for Stream A sessions. Not shipped to users.',
  },
  {
    path: join('docs', 'FRONTEND-CLAUDE-ENHANCE-RETURN-2026-07-31.md'),
    reason: 'internal agent return pack filename is historical evidence; content is process not product. Not shipped to users.',
  },
  {
    path: join('docs', 'NITRO-SESSION-PROMPT.md'),
    reason: 'internal session paste for Nitro/agents. Not shipped to users.',
  },
  {
    path: join('docs', 'NITRO-FRONTEND-NEW-CHAT-HANDOFF-2026-07-31.md'),
    reason: 'internal chat handoff. Not shipped to users.',
  },
  {
    path: join('docs', 'NITRO-STREAM-A-CLAIM.md'),
    reason: 'internal claim/territory brief. Not shipped to users.',
  },
  {
    path: join('docs', 'BOARD-CLEAR-AGENT-BACKLOG-2026-08-02.md'),
    reason:
      'internal board backlog; must name exact shell paths an agent may touch or territory is unenforceable. Not shipped to users. Remove once vendor dir is renamed.',
  },
];

/** Only these extensions can carry shipped copy. */
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json', '.md', '.mdx', '.html', '.css', '.yaml', '.yml'];

function isAllowlisted(relPath) {
  return ALLOWLIST.some((entry) => relPath === entry.path || relPath.startsWith(entry.path + sep));
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const stats = statSync(full);
    if (stats.isDirectory()) yield* walk(full);
    else if (EXTENSIONS.some((ext) => name.endsWith(ext))) yield full;
  }
}

const violations = [];
let scanned = 0;

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (isAllowlisted(rel)) continue;

  scanned++;
  const content = readFileSync(file, 'utf8');
  const lines = content.split('\n');

  for (const { pattern, reason } of FORBIDDEN) {
    if (!pattern.test(content)) continue;
    lines.forEach((line, i) => {
      // Fresh regex per line: the shared one may carry lastIndex state.
      if (new RegExp(pattern.source, pattern.flags.replace('g', '')).test(line)) {
        violations.push({ file: rel, line: i + 1, text: line.trim().slice(0, 120), reason });
      }
    });
  }
}

if (violations.length > 0) {
  console.error(`\n✖ BRAND SCAN FAILED — ${violations.length} occurrence(s) of a forbidden name (Doctrine §0.7)\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.text}`);
    console.error(`    → ${v.reason}\n`);
  }
  console.error('  User-facing copy says only: Identity Blueprint · Sovereign Intelligence · Neural Engine.\n');
  process.exit(1);
}

console.log(`✓ brand-scan clean — ${scanned} files, 0 forbidden names (Doctrine §0.7)`);
