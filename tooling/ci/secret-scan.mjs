#!/usr/bin/env node
/**
 * SECRET SCAN — no credential-shaped literal in a tracked file.
 *
 * WHY THIS RULE EXISTS, in the words of what actually happened here.
 *
 * The vendored Java platform arrived with ~40 credentials sitting in tracked
 * `application.properties` files: Redis passwords, an SMTP password, cloud
 * access key pairs, SMS gateway passwords, captcha private keys, MongoDB URIs
 * with embedded credentials, block-explorer API keys, a signing-key password.
 *
 * One of them was not decoration. `security.user.password` guarded the Spring
 * Boot actuator on a service whose port is published to 0.0.0.0. Anyone holding
 * a copy of this repository could authenticate to `/uc/monitor/heapdump` and
 * download the entire process heap — every secret in memory, every in-flight
 * user record. That was proven against the running fleet, not theorised.
 *
 * The lesson is not "be careful with secrets". It is that a committed credential
 * is invisible: it reviews as a config line, it survives every rebrand, and the
 * day it becomes reachable nobody re-reads the file. So the check is mechanical.
 *
 * WHAT IT ENFORCES
 *
 * For every assignment whose KEY looks like a credential (password, secret,
 * token, api key, access key, private key), the VALUE must be one of:
 *
 *   1. An environment placeholder — `${VAR}`. The service reads it from the
 *      environment and, because there is no `:-default`, refuses to start
 *      without it. This is the outcome we want.
 *   2. Empty. Nothing to leak.
 *   3. An obvious, self-declaring placeholder (see PLACEHOLDER_VALUES). It has
 *      to announce itself; "hunter2" does not count.
 *
 * Anything else fails. It also flags URLs carrying inline `user:password@`
 * credentials, which the key-name check alone would miss — `spring.data.mongodb.uri`
 * is not a credential-shaped key but it carried one.
 *
 * DELIBERATELY NOT A HIGH-ENTROPY SCANNER. Entropy heuristics fire on minified
 * bundles, lockfile hashes, git SHAs and base64 images, and a gate that cries
 * wolf is a gate people learn to bypass with --no-verify. This checks a narrow
 * thing exactly.
 *
 * Exit 0 = no credential-shaped literal is tracked. Exit 1 = one landed.
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname } from 'node:path';

const ROOT = process.cwd();

/**
 * Config-ish files only. A secret in a `.java`/`.ts` source file is a different
 * (rarer) problem and a much noisier scan; this targets where credentials
 * actually accumulate.
 */
const SCANNED_EXTENSIONS = new Set(['.properties', '.yml', '.yaml', '.env', '.conf', '.cfg', '.ini', '.toml', '.json']);

/** Explicitly scanned regardless of extension. */
const SCANNED_BASENAMES = new Set(['.env.example', 'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml']);

/**
 * Paths where a credential-shaped literal is expected and harmless.
 * Every entry needs a reason. "It was noisy" is not a reason.
 */
const EXEMPT_PATHS = [
  { pattern: /(^|[\\/])node_modules[\\/]/, reason: 'third-party dependencies, not our tracked config' },
  { pattern: /(^|[\\/])(dist|build|coverage|\.turbo|\.next)[\\/]/, reason: 'build output' },
  {
    pattern: /(^|[\\/])(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/,
    reason: 'dependency lockfiles — integrity hashes and registry URLs, not credentials',
  },
  {
    pattern: /(^|[\\/])i18n[\\/]|(^|[\\/])(messages|ValidationMessages)_[a-z]{2}_[A-Z]{2}\.properties$/,
    reason:
      'i18n message bundles. Keys like `member.password.error` are UI strings whose VALUE is prose ("Password is incorrect"), not a credential. Scanning them produces one false positive per translated string per language, which is how a gate gets switched off.',
  },
];

/**
 * Values that announce themselves as placeholders. A value matching one of
 * these is allowed to sit in a tracked file because reading it teaches an
 * attacker nothing and a developer everything.
 *
 * `*_dev_only` is the repo's existing convention (see the vendored exchange
 * compose file) and is kept deliberately: those values are matched pairs
 * between compose and the packaged properties, and breaking one half of the
 * pair to satisfy a scanner would be theatre.
 */
const PLACEHOLDER_VALUES = [
  /^\s*$/,
  /^\$\{[^}]+\}$/, // ${VAR} — the outcome we want
  /^\$\{[^}]+:\?[\s\S]*\}$/, // ${VAR:?message} — compose refuses to start without it. STRONGER than ${VAR}; always allowed.
  /^\$\{[^}]+:-[^}]*\}$/, // ${VAR:-default} — allowed here, flagged below if it defaults to something secret-shaped
  /^[a-z0-9_-]*dev[_-]?only[a-z0-9_-]*$/i,
  /^(changeme|change_me|placeholder|example|sample|dummy|redacted|removed|none|null|todo|tbd|xxx+|x{3,})$/i,
  /placeholder/i,
  /^dev-only-/i,
  /^your[_-]/i,
  /^<.*>$/, // <your-key-here>
  /^\*+$/,
  // YAML anchor declaration (`x-edge-secret: &edge-secret`) or alias (`*edge-secret`).
  // The value on this line is the anchor NAME; the mapping it introduces is on the
  // following lines and is checked there, line by line, like any other assignment.
  /^[&*][A-Za-z0-9_.-]+$/,
];

/** Keys that look like credentials. */
const SECRET_KEY =
  /(?:^|[._-])(?:pass(?:word|wd|phrase)?|secret|token|api[._-]?key|access[._-]?key|secret[._-]?key|private[._-]?key|credential|auth[._-]?token)s?$/i;

/** URLs carrying inline credentials: scheme://user:password@host */
const INLINE_URL_CREDENTIAL = /\b[a-z][a-z0-9+.-]*:\/\/([^\s:/@]+):([^\s@/]+)@/gi;

/**
 * Keys that read as credential-shaped but are not secrets. Narrow by design.
 */
const NOT_ACTUALLY_SECRET = [
  /(?:^|[._-])(?:keys?[._-]to[._-]sanitize)$/i,
  /(?:^|[._-])(?:password)[._-](?:null|length|required|invalid|mismatch|hint|label|placeholder)$/i, // i18n strings
  /^sms\.internationalPassword$/i, // always empty upstream; still checked for a value
  /(?:^|[._-])URI?L?(?:[._-]|$)/i, // see below
];

/**
 * Why `*URL*` / `*URI*` keys are excluded from the KEY-NAME check specifically:
 * `TEST_DATABASE_URL_TOKEN` is svc-token's test database URL, not a token, and
 * `DATABASE_URL` is not a password. The secret content of a URL is the
 * `user:password@` inside it — which INLINE_URL_CREDENTIAL checks on the same
 * line, and checks better. Excluding them here removes a false positive without
 * removing any coverage.
 */

function tracked() {
  const out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.split('\0').filter(Boolean);
}

function isScanned(rel) {
  const base = rel.split(/[\\/]/).pop();
  if (SCANNED_BASENAMES.has(base)) return true;
  if (base.startsWith('.env')) return true;
  return SCANNED_EXTENSIONS.has(extname(base).toLowerCase());
}

function exemptReason(rel) {
  for (const { pattern, reason } of EXEMPT_PATHS) if (pattern.test(rel)) return reason;
  return null;
}

const isPlaceholder = (value) => PLACEHOLDER_VALUES.some((p) => p.test(value.trim()));

/**
 * The repo's dev convention: a credential whose password EQUALS its username —
 * `svc_trade:svc_trade@postgres`, `intafaced:intafaced`. It appears throughout
 * docker-compose, .env.example and the CI workflow.
 *
 * Treated as a self-evident non-secret, and that is a judgement worth stating.
 * A reader who sees `svc_trade:svc_trade` learns nothing they did not already
 * know from the username, so it carries no information an attacker can use. It
 * is not "safe" in the sense of being a good password — it is safe in the sense
 * of not being a *disclosure*. If one of these ever guards something reachable,
 * the finding is the reachability, not the literal, and this scan is the wrong
 * tool for it. Host exposure is checked against `docker ps`; see
 * docs/A1.4-WALLET-SECRETS-PERIMETER-2026-07-30.md.
 */
const isMatchedDevPair = (user, password) => user.toLowerCase() === password.toLowerCase();

const violations = [];
let filesScanned = 0;
let assignmentsChecked = 0;

for (const rel of tracked()) {
  if (!isScanned(rel)) continue;
  if (exemptReason(rel)) continue;

  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;

  let content;
  try {
    content = readFileSync(abs, 'utf8');
  } catch {
    continue; // unreadable or binary
  }
  if (content.includes('\u0000')) continue;

  filesScanned++;
  const lines = content.split(/\r?\n/);

  /**
   * Usernames declared anywhere in this file. Used to recognise the matched
   * dev pair when it is written as two adjacent keys rather than inside a URL:
   *
   *     POSTGRES_USER: intafaced
   *     POSTGRES_PASSWORD: intafaced
   *
   * Same judgement as isMatchedDevPair — a password identical to the username
   * sitting beside it discloses nothing.
   */
  const declaredUsernames = new Set(
    lines
      .map((l) => /^[-\s]*["']?([A-Za-z0-9_.\-[\]]*(?:user|username|user_name))["']?\s*[:=]\s*(.+?)\s*$/i.exec(l.trim()))
      .filter(Boolean)
      .map((m) => m[2].replace(/^['"]|['"]$/g, '').toLowerCase()),
  );

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('*')) return;

    // ── credential-shaped key = literal value ────────────────────────────────
    // Handles `key=value`, `key: value` and `- key: value`.
    const assignment = /^[-\s]*["']?([A-Za-z0-9_.\-[\]]+)["']?\s*[:=]\s*(.*)$/.exec(trimmed);
    if (assignment) {
      const [, key, rawValue] = assignment;
      const value = rawValue.replace(/\s+#.*$/, '').replace(/^['"]|['"]$/g, '');

      if (SECRET_KEY.test(key) && !NOT_ACTUALLY_SECRET.some((p) => p.test(key))) {
        assignmentsChecked++;
        if (declaredUsernames.has(value.toLowerCase()) && value.trim() !== '') {
          // password === a username declared in this same file: the dev convention.
        } else if (!isPlaceholder(value)) {
          violations.push({
            check: 'committed-credential',
            file: rel,
            line: lineNo,
            key,
            reason: `\`${key}\` is assigned a literal value`,
            detail:
              'Move it to the environment with NO default — `${VAR}` — so the service refuses to start rather than booting on a stale credential.',
          });
        } else if (/^\$\{[^}]+:-(.+)\}$/.test(value)) {
          const fallback = /^\$\{[^}]+:-(.+)\}$/.exec(value)[1];
          if (!isPlaceholder(fallback)) {
            violations.push({
              check: 'credential-default',
              file: rel,
              line: lineNo,
              key,
              reason: `\`${key}\` falls back to a non-placeholder default`,
              detail: 'A default on a credential means the service boots insecurely instead of failing loudly. Drop the `:-fallback`.',
            });
          }
        }
      }
    }

    // ── inline user:password@host in any URL ─────────────────────────────────
    INLINE_URL_CREDENTIAL.lastIndex = 0;
    let m;
    while ((m = INLINE_URL_CREDENTIAL.exec(trimmed)) !== null) {
      const [, user, password] = m;
      if (isPlaceholder(password) || password.includes('${')) continue;
      if (isMatchedDevPair(user, password)) continue;
      assignmentsChecked++;
      violations.push({
        check: 'inline-url-credential',
        file: rel,
        line: lineNo,
        key: '(URL)',
        reason: 'a URL on this line embeds `user:password@host`',
        detail: 'Put the whole URL in the environment with no default. A credential hidden inside a connection string is still a committed credential.',
      });
    }
  });
}

if (violations.length > 0) {
  console.error(`\n✖ SECRET SCAN FAILED — ${violations.length} credential-shaped literal(s) in tracked files\n`);
  for (const v of violations) {
    // Deliberately prints the KEY and LOCATION, never the value. A CI log is
    // not a place to reproduce the secret you are complaining about.
    console.error(`  [${v.check}] ${v.file}:${v.line}`);
    console.error(`    → ${v.reason}`);
    console.error(`      ${v.detail}\n`);
  }
  console.error('  A committed credential is invisible in review and permanent in history.');
  console.error('  If a value here is genuinely not a secret, make it say so (see PLACEHOLDER_VALUES\n  in tooling/ci/secret-scan.mjs) rather than widening the rule.\n');
  process.exit(1);
}

console.log(`✓ secret-scan clean — ${assignmentsChecked} credential-shaped assignment(s) across ${filesScanned} tracked config file(s)`);
