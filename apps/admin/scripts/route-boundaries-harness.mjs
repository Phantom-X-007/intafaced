#!/usr/bin/env node
/**
 * Real-HTTP admin route-boundary harness (CLASS: TRUTH).
 *
 * `next build` + `next start` this worktree's admin app on a unique port
 * (never :3100), GET a missing path and the fail-closed crash probe, then
 * kills only the pid it spawned. Production start is required: `next dev`
 * overlays a digest without SSR of `error.tsx`. Does not call RouteBoundary
 * in-process. Leaves the existing BFF unconfigured harness alone.
 */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { assertMissingPathNotFound, assertThrownRenderErrorIsolated } from '../e2e/route-boundaries.spec.mjs';

const HOST = '127.0.0.1';
const FORBIDDEN_DEFAULT_PORT = 3100;
const READY_TIMEOUT_MS = 180_000;
const POLL_MS = 500;

const ADMIN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = join(ADMIN_DIR, '..', '..');
const NEXT_CLI = join(ADMIN_DIR, 'node_modules', 'next', 'dist', 'bin', 'next');
const ADMIN_DEP_DISTS = ['config', 'contracts', 'i18n', 'ui'].map((name) => join(REPO_ROOT, 'packages', name, 'dist', 'index.js'));

function fail(msg) {
  throw new Error(msg);
}

function resolvePnpm() {
  for (const dir of (process.env.PATH || '').split(':')) {
    const cand = join(dir, 'pnpm');
    if (dir && existsSync(cand)) return cand;
  }
  const pinned = join(REPO_ROOT, '.tools', 'bin', 'pnpm');
  if (existsSync(pinned)) return pinned;
  fail('pnpm not on PATH — need /Users/Nitro/projects/Sovereign/.tools/bin/pnpm');
}

function buildAdminWorkspaceDeps() {
  if (ADMIN_DEP_DISTS.every((p) => existsSync(p))) {
    console.log('[route-boundaries-harness] workspace package dist already present');
    return;
  }
  const pnpm = resolvePnpm();
  console.log('[route-boundaries-harness] building @intafaced/admin workspace deps (Next resolves package exports to dist/)');
  execFileSync(pnpm, ['--filter', '@intafaced/admin^...', 'build'], {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'inherit',
  });
  const missing = ADMIN_DEP_DISTS.filter((p) => !existsSync(p));
  if (missing.length) fail(`workspace dist still missing after build: ${missing.join(', ')}`);
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

async function uniquePort() {
  for (let i = 0; i < 8; i++) {
    const port = await allocateFreePort();
    if (port > 0 && port !== FORBIDDEN_DEFAULT_PORT) return port;
  }
  fail(`could not allocate a unique port other than ${FORBIDDEN_DEFAULT_PORT}`);
}

function listenerPids(port) {
  try {
    const out = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out
      .split(/\s+/)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);
  } catch {
    return [];
  }
}

function descendants(rootPid) {
  const pids = new Set([rootPid]);
  const queue = [rootPid];
  while (queue.length) {
    const parent = queue.pop();
    try {
      const out = execFileSync('pgrep', ['-P', String(parent)], { encoding: 'utf8' }).trim();
      for (const token of out.split(/\s+/)) {
        const n = Number(token);
        if (n > 0 && !pids.has(n)) {
          pids.add(n);
          queue.push(n);
        }
      }
    } catch {
      /* no children */
    }
  }
  return pids;
}

function stopSpawned(child) {
  if (!child?.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
}

function childEnv() {
  const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', ADMIN_ROUTE_PROBE: '1' };
  delete env.ADMIN_BFF_SHARED_SECRET;
  delete env.ADMIN_ROUTE_BOUNDARIES_HARNESS_URL;
  return env;
}

async function waitForOurListener(port, child, logs) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  const tree = () => descendants(child.pid);
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      fail(`next exited ${child.exitCode} before listen\n${logs()}`);
    }
    const listening = listenerPids(port);
    if (listening.length) {
      const ours = tree();
      const foreign = listening.filter((pid) => !ours.has(pid));
      if (foreign.length) {
        fail(`port ${port} is owned by foreign pid(s) ${foreign.join(',')} — refusing to treat that as this harness`);
      }
      return listening;
    }
    await sleep(POLL_MS);
  }
  fail(`next did not listen on ${HOST}:${port} within ${READY_TIMEOUT_MS}ms\n${logs()}`);
}

async function waitForHttp(url, child, logs) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let last = 'down';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      fail(`next exited ${child.exitCode} before HTTP\n${logs()}`);
    }
    try {
      const res = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(15_000),
      });
      const text = await res.text();
      if (res.status === 200 && text.includes('Operator Console')) return;
      last = `HTTP ${res.status} (compiling)`;
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    await sleep(POLL_MS);
  }
  fail(`no HTTP from ${url} within ${READY_TIMEOUT_MS}ms (${last})\n${logs()}`);
}

async function main() {
  if (!existsSync(NEXT_CLI)) fail(`next CLI missing at ${NEXT_CLI} — pnpm install in this worktree`);
  const major = Number(process.versions.node.split('.')[0]);
  if (!Number.isFinite(major) || major < 20) fail(`Node >= 20 required, got ${process.versions.node}`);
  buildAdminWorkspaceDeps();

  const stdout = [];
  const stderr = [];
  const cap = (buf, chunk) => {
    buf.push(chunk);
    if (buf.length > 80) buf.splice(0, buf.length - 80);
  };
  const tail = (text) => {
    const lines = text.split(/\r?\n/);
    return lines.slice(-40).join('\n');
  };
  const logs = () => `--- stdout (tail) ---\n${tail(stdout.join(''))}\n--- stderr (tail) ---\n${tail(stderr.join(''))}`;

  const buildEnv = childEnv();
  console.log('[route-boundaries-harness] next build (ADMIN_ROUTE_PROBE=1 so the crash probe throws)');
  execFileSync(process.execPath, [NEXT_CLI, 'build'], {
    cwd: ADMIN_DIR,
    env: buildEnv,
    stdio: 'inherit',
  });

  const port = await uniquePort();
  if (listenerPids(port).length) {
    fail(`port ${port} already has a listener — not using a foreign process`);
  }

  const child = spawn(process.execPath, [NEXT_CLI, 'start', '--port', String(port), '--hostname', HOST], {
    cwd: ADMIN_DIR,
    env: buildEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });

  if (!child.pid) fail('next spawn produced no pid');
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => cap(stdout, chunk));
  child.stderr.on('data', (chunk) => cap(stderr, chunk));

  let exitError = null;
  const finished = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      if (code && code !== 0) exitError = `next exit ${code}${signal ? ` ${signal}` : ''}`;
      resolve();
    });
  });

  const base = `http://${HOST}:${port}`;
  try {
    console.log(`[route-boundaries-harness] spawned pid ${child.pid} on ${base} (ADMIN_ROUTE_PROBE=1, secret unset)`);
    await waitForOurListener(port, child, logs);
    await waitForHttp(`${base}/`, child, logs);
    const missing = await assertMissingPathNotFound(base);
    console.log(`[route-boundaries-harness] ok: GET ${missing.url} → ${missing.status} not-found`);
    const crash = await assertThrownRenderErrorIsolated(base);
    console.log(`[route-boundaries-harness] ok: GET ${crash.url} → error isolated`);
  } catch (err) {
    if (exitError) console.error(`[route-boundaries-harness] ${exitError}`);
    console.error(logs());
    throw err;
  } finally {
    stopSpawned(child);
    const killer = setTimeout(() => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        try {
          child.kill('SIGKILL');
        } catch {
          /* gone */
        }
      }
    }, 5_000);
    killer.unref?.();
    await Promise.race([finished, sleep(6_000)]);
    clearTimeout(killer);
  }
}

main().catch((err) => {
  console.error(`[route-boundaries-harness] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
