#!/usr/bin/env node
/**
 * Stream A shell boot — idempotent, detached, never foreground.
 *
 * Spec: docs/FRONTEND-OPERATING-PLAN-2026-07-30.md §2.4 / GO packet PR-1.
 *
 *   pnpm ui:boot          # PORT defaults to 8090
 *   PORT=8091 pnpm ui:boot
 *
 * The shell is webpack 3 / 2018. It needs Node 18 (not 20+). Prefer:
 *   STREAM_A_NODE=/path/to/node18
 *   or <repo>/.tools/node18/bin/node
 *
 * Behaviours (all required):
 * 1. Reuse before spawn — probe GET / ; if 200, exit 0
 * 2. Detached spawn + unref — turn does not wait on the child
 * 3. cwd = <repo>/vendor/<name>/05_Web_Front (branch under test)
 * 4. Missing node_modules → exit 1 with exact npm ci command
 * 5. Ready = GET / 200 AND GET /app.js 200 (webpack serves HTML early)
 * 6. 240s timeout → exit 1 + last 40 log lines
 * 7. Pidfile + log under .artifacts/uiproof/
 */
import { spawn, execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  openSync,
  closeSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();

const PORT = Number(process.env.PORT || 8090);
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}`;
const READY_TIMEOUT_MS = 240_000;
const POLL_MS = 2_000;

const ARTIFACTS = join(REPO_ROOT, '.artifacts', 'uiproof');
const LOG_PATH = join(ARTIFACTS, 'devserver.log');
const PID_PATH = join(ARTIFACTS, 'devserver.pid');

function fail(msg, code = 1) {
  console.error(`[ui:boot] ${msg}`);
  process.exit(code);
}

function log(msg) {
  console.log(`[ui:boot] ${msg}`);
}

function resolveShellDir() {
  const vendorRoot = join(REPO_ROOT, 'vendor');
  if (!existsSync(vendorRoot)) {
    fail(`No vendor/ under ${REPO_ROOT}`);
  }
  for (const name of readdirSync(vendorRoot)) {
    const candidate = join(vendorRoot, name, '05_Web_Front');
    try {
      if (statSync(candidate).isDirectory()) return candidate;
    } catch {
      /* skip */
    }
  }
  fail(`No vendor/<name>/05_Web_Front under ${REPO_ROOT}`);
}

/**
 * Webpack 3 / spdy / http-deceiver need Node 18.
 * Never use the monorepo Node 20+ for the shell process.
 */
function resolveShellNode() {
  const candidates = [
    process.env.STREAM_A_NODE,
    join(REPO_ROOT, '.tools', 'node18', 'bin', 'node'),
    // Sibling worktree that already bootstrapped Stream A (optional reuse).
    join(REPO_ROOT, '..', 'Sovereign', '.worktrees', 'feat-app-phase1-plan', '.tools', 'node18', 'bin', 'node'),
  ].filter(Boolean);

  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        const v = execFileSync(c, ['-v'], { encoding: 'utf8' }).trim(); // e.g. v18.20.5
        const major = Number(v.replace(/^v/, '').split('.')[0]);
        if (major >= 16 && major < 20) {
          return { nodeBin: c, version: v };
        }
        log(`skipping ${c} (${v}) — shell needs Node 16–18`);
      } catch {
        /* try next */
      }
    }
  }

  fail(
    `No Node 18 binary found for the Stream A shell.\n` +
      `  The shell (webpack 3) dies on Node 20+ with: Error: No such module: http_parser\n` +
      `  Fix once per machine:\n` +
      `    mkdir -p "${join(REPO_ROOT, '.tools')}" && cd "${join(REPO_ROOT, '.tools')}" && \\\n` +
      `    curl -fsSL https://nodejs.org/dist/v18.20.5/node-v18.20.5-darwin-arm64.tar.gz | tar -xz && \\\n` +
      `    mv node-v18.20.5-darwin-arm64 node18\n` +
      `  Or set STREAM_A_NODE=/path/to/node18/bin/node`,
  );
}

async function httpStatus(path) {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000),
    });
    return res.status;
  } catch {
    return 0;
  }
}

function readPidfile() {
  try {
    if (!existsSync(PID_PATH)) return null;
    const raw = readFileSync(PID_PATH, 'utf8').trim();
    const pid = Number(raw);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function guessListenerPid() {
  try {
    const out = execFileSync('lsof', [`-iTCP:${PORT}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const first = out.split(/\s+/)[0];
    const pid = Number(first);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return readPidfile();
  }
}

function ensureArtifacts() {
  mkdirSync(ARTIFACTS, { recursive: true });
}

function tailLog(n = 40) {
  if (!existsSync(LOG_PATH)) return '(no log file)';
  const text = readFileSync(LOG_PATH, 'utf8');
  const lines = text.split(/\r?\n/);
  return lines.slice(-n).join('\n');
}

async function waitReady() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const root = await httpStatus('/');
    const app = await httpStatus('/app.js');
    if (root === 200 && app === 200) return true;
    log(`waiting… / → ${root || 'down'}, /app.js → ${app || 'down'}`);
    await sleep(POLL_MS);
  }
  return false;
}

async function main() {
  // 1. Reuse before spawn
  const existing = await httpStatus('/');
  if (existing === 200) {
    const pid = guessListenerPid() ?? 'unknown';
    log(`reusing existing server (pid ${pid}) on ${BASE}`);
    process.exit(0);
  }

  const shellDir = resolveShellDir();
  const { nodeBin, version } = resolveShellNode();
  const nodeDir = dirname(nodeBin);
  log(`shell: ${shellDir}`);
  log(`port:  ${PORT}`);
  log(`node:  ${nodeBin} (${version})`);

  // 4. Fail loudly on missing deps
  if (!existsSync(join(shellDir, 'node_modules'))) {
    fail(
      `node_modules missing in ${shellDir}\n` +
        `  Run this exact command, then retry pnpm ui:boot:\n` +
        `  cd "${shellDir}" && PATH="${nodeDir}:$PATH" npm ci`,
    );
  }

  ensureArtifacts();

  writeFileSync(LOG_PATH, `--- ui:boot spawn ${new Date().toISOString()} PORT=${PORT} NODE=${nodeBin} ---\n`);

  // 2. Detached spawn — never await the child.
  // npm-cli must run under Node 18; put node18 first on PATH.
  const outFd = openSync(LOG_PATH, 'a');
  const npmCli = join(nodeDir, 'npm');
  const npmBin = existsSync(npmCli) ? npmCli : 'npm';

  const child = spawn(npmBin, ['run', 'dev'], {
    cwd: shellDir,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST,
      PATH: `${nodeDir}:${process.env.PATH || ''}`,
      // strip pnpm-injected npm configs that spam warnings under npm 10
      npm_config_prefer_workspace_packages: undefined,
      npm_config_link_workspace_packages: undefined,
      npm_config_auto_install_peers: undefined,
      npm_config_verify_deps_before_run: undefined,
    },
    detached: true,
    stdio: ['ignore', outFd, outFd],
  });
  closeSync(outFd);

  if (!child.pid) {
    fail('spawn returned no pid');
  }

  // 7. Pidfile
  writeFileSync(PID_PATH, String(child.pid));
  log(`spawned detached pid ${child.pid} (log: ${LOG_PATH})`);

  child.unref();

  // 5–6. Two-stage readiness, bounded
  const ok = await waitReady();
  if (!ok) {
    console.error(`[ui:boot] timeout after ${READY_TIMEOUT_MS / 1000}s — last 40 log lines:`);
    console.error(tailLog(40));
    process.exit(1);
  }

  log(`ready ${BASE}  (GET / and GET /app.js both 200)`);
  process.exit(0);
}

main().catch((err) => {
  fail(err?.stack || String(err));
});
