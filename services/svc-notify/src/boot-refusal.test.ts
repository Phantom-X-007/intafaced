import { spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * THE SERVICE REFUSES TO START. Not "the parser returned false".
 *
 * `env.test.ts` next door proves the schema rejects a required channel with no
 * credentials. That is a good test of a schema and it is not a proof of the
 * property anyone actually depends on, which is that **the process does not
 * come up**. A schema can be correct and reach nothing: it only stops a boot if
 * the entrypoint imports it, imports it before it does anything else, and lets
 * the failure kill the process instead of logging it. Each of those is a line
 * somebody can change without touching the schema or its tests.
 *
 * So this suite runs `src/index.ts` — the real entrypoint, the one the
 * container runs — as a child process, and reads the exit code.
 *
 * WHY IT IS SAFE AND FAST
 *
 * `DATABASE_URL` points at `127.0.0.1:1`, where nothing listens, so the
 * connection is refused instantly and no database is touched by any case here.
 * The database name still ends in `_test` per `tooling/ci/test-db-scan.mjs`.
 * Nothing else is reachable either: the gateway URLs are unroutable and are
 * never called, because the process dies before it has a dispatcher. Each case
 * costs about half a second.
 *
 * THE POSITIVE CONTROL IS THE POINT
 *
 * A test that only asserts "svc-notify exited 1" proves nothing — a typo in the
 * env fixture also exits 1. So the refusal case asserts the process died AT THE
 * CREDENTIAL GATE and never reached the database probe, and the control case
 * asserts that the same environment WITH the credentials gets past the gate and
 * dies at the database probe instead. Together they say: the gate is what
 * stopped it, and the gate is the only thing that stopped it.
 *
 * ASYNC SPAWN (not spawnSync)
 *
 * Cold CI can spend ~10s per case on the tsx import graph. `spawnSync` blocks
 * the vitest worker event loop for that whole window, so the worker cannot
 * answer birpc `onTaskUpdate` and the suite exits 1 with every assertion green
 * (`[vitest-worker]: Timeout calling "onTaskUpdate"`). Async `spawn` keeps the
 * same process-refuse proof without starving the worker.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..');
const ENTRYPOINT = join(HERE, 'index.ts');

/** Refused instantly, touches nothing, and `*_test` per the test-db scan. */
const UNREACHABLE_DB = 'postgres://svc_notify:svc_notify@127.0.0.1:1/intafaced_notify_test';

/** The furthest a boot can get here: the first query against the dead port. */
const PAST_THE_GATE = 'notify schema is missing';

/** `loadEnv` in `@intafaced/config` throws this and nothing else does. */
const REFUSED_AT_THE_GATE = 'Invalid environment for svc-notify';

const SMS_CREDS = {
  NOTIFY_SMS_GATEWAY_URL: 'https://gateway.invalid/sms',
  NOTIFY_SMS_GATEWAY_TOKEN: 's'.repeat(24),
};

/**
 * Boot svc-notify with exactly this environment and nothing inherited.
 *
 * The child gets no ambient `process.env`: a worktree with a populated `.env`
 * would otherwise hand it a working `DATABASE_URL` or a stray gateway token and
 * the suite would pass or fail on the developer's machine rather than on the
 * code. Only `PATH` and `SystemRoot` are carried, because node needs them.
 */
function boot(over: Record<string, string>): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', ENTRYPOINT], {
      cwd: PKG,
      env: {
        PATH: process.env.PATH ?? '',
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
        SERVICE_NAME: 'svc-notify',
        DATABASE_URL: UNREACHABLE_DB,
        EDGE_PRINCIPAL_SECRET: 'e'.repeat(40),
        ...over,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ code: null, stderr });
    }, BOOT_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
  });
}

/**
 * Each case spawns the REAL entrypoint through tsx, so the clock covers a cold
 * TypeScript compile of the whole import graph, not just the gate. On this
 * machine that is ~0.5s; on a cold CI runner it exceeded vitest's 5s default
 * and all six timed out — a red that said nothing about the gate.
 *
 * Raised deliberately rather than by making the tests cheaper: the thing worth
 * asserting is that the real process refuses to start, and a test that stopped
 * spawning it would pass without proving that. The spawn itself already caps at
 * BOOT_TIMEOUT_MS, so a genuinely hung boot still fails rather than hanging the
 * suite.
 */
const BOOT_TIMEOUT_MS = 30_000;

describe('svc-notify does not start when a channel it depends on has no credentials', () => {
  it(
    'refuses to boot, names both missing variables, and never reaches the database',
    async () => {
      const { code, stderr } = await boot({ APP_ENV: 'prod', NOTIFY_REQUIRED_CHANNELS: 'sms' });

      expect(code).not.toBe(0);
      expect(stderr).toContain(REFUSED_AT_THE_GATE);
      // The message is an ops instruction, so it must name the variables verbatim.
      expect(stderr).toContain('NOTIFY_SMS_GATEWAY_URL');
      expect(stderr).toContain('NOTIFY_SMS_GATEWAY_TOKEN');
      // The half that makes this a boot gate rather than a late error: the process
      // died before it opened a socket, not after it had come up and started
      // serving with a channel that silently refuses everything.
      expect(stderr).not.toContain(PAST_THE_GATE);
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    'gets past the gate once the credentials are set — proving the gate is what stopped it',
    async () => {
      const { code, stderr } = await boot({
        APP_ENV: 'prod',
        NOTIFY_REQUIRED_CHANNELS: 'sms',
        ...SMS_CREDS,
      });

      expect(code).not.toBe(0); // the dead database port, deliberately
      expect(stderr).not.toContain(REFUSED_AT_THE_GATE);
      expect(stderr).toContain(PAST_THE_GATE);
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    'refuses in prod when nothing is declared at all',
    async () => {
      const { stderr } = await boot({ APP_ENV: 'prod' });

      expect(stderr).toContain(REFUSED_AT_THE_GATE);
      expect(stderr).toContain('must state which out-of-app channels');
      expect(stderr).not.toContain(PAST_THE_GATE);
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    'refuses a declaration made of separators — punctuation is not a stated posture',
    async () => {
      // `blankAsAbsent` catches `""`. `","` is typed, so without the guard in
      // `parseRequiredChannels` it satisfies "you must declare something" while
      // declaring nothing, and prod boots depending on no channel.
      const { stderr } = await boot({ APP_ENV: 'prod', NOTIFY_REQUIRED_CHANNELS: ',' });

      expect(stderr).toContain(REFUSED_AT_THE_GATE);
      expect(stderr).toContain('NOTIFY_REQUIRED_CHANNELS');
      expect(stderr).not.toContain(PAST_THE_GATE);
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    'boots past the gate on an explicit `none` — a decision is allowed to be recorded',
    async () => {
      const { stderr } = await boot({ APP_ENV: 'prod', NOTIFY_REQUIRED_CHANNELS: 'none' });

      expect(stderr).not.toContain(REFUSED_AT_THE_GATE);
      expect(stderr).toContain(PAST_THE_GATE);
    },
    BOOT_TIMEOUT_MS,
  );

  it(
    'leaves dev frictionless — no gateway credentials are needed to run the stack',
    async () => {
      const { stderr } = await boot({ APP_ENV: 'dev' });

      expect(stderr).not.toContain(REFUSED_AT_THE_GATE);
      expect(stderr).toContain(PAST_THE_GATE);
    },
    BOOT_TIMEOUT_MS,
  );
});

describe('exactly one function decides whether svc-notify may start', () => {
  /**
   * The tests above prove the gate works. This one proves there is only one of
   * it, which is the property that actually rotted: a second
   * `parseRequiredChannels` lived in `src/required-channels.ts` for several
   * waves, with a different signature and a different answer, imported by
   * nothing. Every test above would have stayed green the entire time.
   *
   * A structural assertion is the only kind that can catch a rival gate,
   * because a rival gate's defining property is that no behaviour runs it.
   */
  it(
    'has one definition of parseRequiredChannels in src/, and it is the one env.ts imports',
    () => {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
          if (entry === 'node_modules' || entry === 'dist') continue;
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) walk(full);
          else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) files.push(full);
        }
      };
      walk(HERE);

      const definitions = files.filter((f) =>
        /(?:export\s+)?(?:async\s+)?function\s+parseRequiredChannels\b/.test(readFileSync(f, 'utf8')),
      );

      expect(definitions.map((f) => f.slice(HERE.length + 1).replace(/\\/g, '/'))).toEqual(['channels/registry.ts']);
      expect(readFileSync(join(HERE, 'env.ts'), 'utf8')).toMatch(/parseRequiredChannels[\s\S]{0,120}from '\.\/channels\/registry\.js'/);
    },
    BOOT_TIMEOUT_MS,
  );
});
