#!/usr/bin/env node
/**
 * Stream A shell boot — detached, never foreground, never a foreign server.
 *
 *   pnpm ui:boot              # unique free port (not 8090-by-default)
 *   PORT=8091 pnpm ui:boot    # explicit port; refuses a foreign listener
 *
 * Prefer STREAM_A_NODE or <repo>/.tools/node24/bin/node (T1 pin).
 *
 * Reuse only this worktree's own pid+SHA provenance. GET / 200 on :8090 is not proof.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, openSync, closeSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const REPO_ROOT = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8',
}).trim();

const HOST = '127.0.0.1';
const READY_TIMEOUT_MS = 240_000;
const POLL_MS = 2_000;

const ARTIFACTS = join(REPO_ROOT, '.artifacts', 'uiproof');
const LOG_PATH = join(ARTIFACTS, 'devserver.log');
const PID_PATH = join(ARTIFACTS, 'devserver.pid');
const PROVENANCE_PATH = join(ARTIFACTS, 'provenance.json');

function fail(msg, code = 1) {
  console.error(`[ui:boot] ${msg}`);
  process.exit(code);
}

function log(msg) {
  console.log(`[ui:boot] ${msg}`);
}

function repoSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', cwd: REPO_ROOT }).trim();
}

function mainCheckoutNode24() {
  try {
    const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      encoding: 'utf8',
      cwd: REPO_ROOT,
    }).trim();
    const gitDir = resolve(REPO_ROOT, common);
    return join(dirname(gitDir), '.tools', 'node24', 'bin', 'node');
  } catch {
    return null;
  }
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

function resolveShellNode() {
  const candidates = [
    process.env.STREAM_A_NODE,
    join(REPO_ROOT, '.tools', 'node24', 'bin', 'node'),
    mainCheckoutNode24(),
    process.execPath,
  ].filter(Boolean);

  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        const v = execFileSync(c, ['-v'], { encoding: 'utf8' }).trim();
        const major = Number(v.replace(/^v/, '').split('.')[0]);
        if (major === 24) {
          return { nodeBin: c, version: v };
        }
        log(`skipping ${c} (${v}) — shell needs the Node 24 LTS line`);
      } catch {
        /* try next */
      }
    }
  }

  fail(
    `No Node 24 binary found for the Stream A shell.\n` +
      `  Place Node 24 at ${join(REPO_ROOT, '.tools', 'node24')} (pnpm wt provisions it),\n` +
      `  or set STREAM_A_NODE=/path/to/node24/bin/node.`,
  );
}

async function httpStatus(base, path) {
  const url = `${base}${path}`;
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

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readProvenance() {
  try {
    if (!existsSync(PROVENANCE_PATH)) return null;
    return JSON.parse(readFileSync(PROVENANCE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function writeProvenance({ pid, port, sha }) {
  writeFileSync(
    PROVENANCE_PATH,
    `${JSON.stringify({ pid, port, sha, worktree: REPO_ROOT, startedAt: new Date().toISOString() }, null, 2)}\n`,
  );
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

function listenerPid(port) {
  try {
    const out = execFileSync('lsof', [`-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const first = out.split(/\s+/)[0];
    const pid = Number(first);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function allocateFreePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, HOST, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      server.close((err) => (err ? reject(err) : resolvePort(port)));
    });
  });
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

async function waitReady(base) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const root = await httpStatus(base, '/');
    const app = await httpStatus(base, '/app.js');
    if (root === 200 && app === 200) return true;
    log(`waiting… / → ${root || 'down'}, /app.js → ${app || 'down'}`);
    await sleep(POLL_MS);
  }
  return false;
}

function oursOnPort(port, sha) {
  const proven = readProvenance();
  const pid = readPidfile();
  if (!proven || !pid) return false;
  if (proven.worktree !== REPO_ROOT) return false;
  if (proven.sha !== sha) return false;
  if (Number(proven.port) !== Number(port)) return false;
  if (proven.pid !== pid) return false;
  if (!pidAlive(pid)) return false;
  const listening = listenerPid(port);
  return listening === pid;
}

async function main() {
  const sha = repoSha();
  const explicit = process.env.PORT;
  const port = explicit ? Number(explicit) : await allocateFreePort();
  if (!Number.isFinite(port) || port <= 0) fail(`Invalid PORT ${explicit}`);
  const base = `http://${HOST}:${port}`;

  if (oursOnPort(port, sha)) {
    log(`reusing this worktree's server pid ${readPidfile()} at ${base} sha ${sha.slice(0, 8)}`);
    process.exit(0);
  }

  const foreign = listenerPid(port);
  if (foreign) {
    fail(
      `Port ${port} is already bound by pid ${foreign}, which is not this worktree at ${sha.slice(0, 8)}.\n` +
        `  GET / 200 is not provenance. Pick a free PORT or omit PORT for a unique bind.`,
    );
  }

  const shellDir = resolveShellDir();
  const { nodeBin, version } = resolveShellNode();
  const nodeDir = dirname(nodeBin);
  log(`shell: ${shellDir}`);
  log(`port:  ${port}`);
  log(`sha:   ${sha}`);
  log(`node:  ${nodeBin} (${version})`);

  if (!existsSync(join(shellDir, 'node_modules'))) {
    fail(
      `node_modules missing in ${shellDir}\n` +
        `  Run this exact command, then retry pnpm ui:boot:\n` +
        `  cd "${shellDir}" && PATH="${nodeDir}:$PATH" npm ci --ignore-scripts`,
    );
  }

  ensureArtifacts();

  writeFileSync(LOG_PATH, `--- ui:boot spawn ${new Date().toISOString()} PORT=${port} NODE=${nodeBin} SHA=${sha} WT=${REPO_ROOT} ---\n`);

  const outFd = openSync(LOG_PATH, 'a');
  const npmCli = join(nodeDir, 'npm');
  const npmBin = existsSync(npmCli) ? npmCli : 'npm';

  const child = spawn(npmBin, ['run', 'dev'], {
    cwd: shellDir,
    env: {
      ...process.env,
      PORT: String(port),
      HOST,
      PATH: `${nodeDir}:${process.env.PATH || ''}`,
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

  writeFileSync(PID_PATH, String(child.pid));
  writeProvenance({ pid: child.pid, port, sha });
  log(`spawned detached pid ${child.pid} (log: ${LOG_PATH})`);

  child.unref();

  const ok = await waitReady(base);
  if (!ok) {
    console.error(`[ui:boot] timeout after ${READY_TIMEOUT_MS / 1000}s — last 40 log lines:`);
    console.error(tailLog(40));
    process.exit(1);
  }

  log(`ready ${base}  sha ${sha.slice(0, 8)}  (GET / and GET /app.js both 200)`);
  log(`provenance ${PROVENANCE_PATH}`);
  process.exit(0);
}

main().catch((err) => {
  fail(err?.stack || String(err));
});
