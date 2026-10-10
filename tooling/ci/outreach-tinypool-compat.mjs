import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const allowedVitestVersions = ['3.2.4', '3.2.7'];
const requestedVitestVersion = process.argv[2];
if (process.argv.length !== 3 || !allowedVitestVersions.includes(requestedVitestVersion)) {
  console.error(`Usage: node tooling/ci/outreach-tinypool-compat.mjs <${allowedVitestVersions.join('|')}>`);
  process.exitCode = 1;
  process.exit();
}

const scratchParent = process.env.RUNNER_TEMP || tmpdir();
const scratch = mkdtempSync(join(scratchParent, 'intafaced-tinypool-compat-'));

function write(relativePath, contents) {
  const path = join(scratch, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function run(command, args, expectedCode, label) {
  console.log(`\n--- ${label} ---`);
  const result = spawnSync(command, args, {
    cwd: scratch,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  process.stdout.write(output);
  if (result.error) throw result.error;
  assert.equal(result.status, expectedCode, `${label} exit status`);
  return output;
}

try {
  console.log(`runtime=${process.version} platform=${process.platform} arch=${process.arch}`);

  write(
    'package.json',
    `${JSON.stringify(
      {
        name: 'intafaced-tinypool-compat-probe',
        private: true,
        type: 'module',
        devDependencies: { vitest: requestedVitestVersion },
        overrides: { tinypool: '2.1.2' },
      },
      null,
      2,
    )}\n`,
  );

  run('npm', ['install'], 0, 'install isolated probe dependencies (no repository files)');

  const vitestPackage = JSON.parse(readFileSync(join(scratch, 'node_modules/vitest/package.json'), 'utf8'));
  const tinypoolPackage = JSON.parse(readFileSync(join(scratch, 'node_modules/tinypool/package.json'), 'utf8'));
  console.log(`vitest=${vitestPackage.version} tinypool=${tinypoolPackage.version}`);
  assert.equal(vitestPackage.version, requestedVitestVersion);
  assert.equal(tinypoolPackage.version, '2.1.2');

  write(
    'vitest.config.mjs',
    `import { defineConfig } from 'vitest/config';
import ProbeSequencer from './sequencer.mjs';
export default defineConfig({ test: { isolate: true, fileParallelism: false, retry: 1, sequence: { sequencer: ProbeSequencer } } });
`,
  );
  write(
    'sequencer.mjs',
    `import { BaseSequencer } from 'vitest/node';
export default class ProbeSequencer extends BaseSequencer {
  async sort(files) { return files.sort((a, b) => a.moduleId.localeCompare(b.moduleId)); }
}
`,
  );
  write(
    'a-isolation.test.js',
    `import { test } from 'vitest';
test('first file sets a global marker', () => { globalThis.__tinypoolCompatProbe = 'set'; });
`,
  );
  write(
    'b-retry.test.js',
    `import { expect, test } from 'vitest';
let attempts = 0;
test('transient failure is retried exactly once', () => {
  attempts += 1;
  if (attempts === 1) throw new Error('synthetic transient failure');
  expect(attempts).toBe(2);
});
`,
  );
  write(
    'c-isolation.test.js',
    `import { expect, test } from 'vitest';
test('following file receives isolated global state', () => { expect(globalThis.__tinypoolCompatProbe).toBeUndefined(); });
`,
  );
  write(
    'd-permanent-failure.test.js',
    `import { test } from 'vitest';
test('permanent failure remains visible after retry', () => { throw new Error('synthetic permanent failure'); });
`,
  );

  const vitest = join(scratch, 'node_modules/vitest/vitest.mjs');
  const config = join(scratch, 'vitest.config.mjs');
  for (const pool of ['threads', 'forks']) {
    run(
      process.execPath,
      [
        vitest,
        'run',
        '--root',
        scratch,
        '--config',
        config,
        `--pool=${pool}`,
        '--maxWorkers=1',
        '--minWorkers=1',
        'a-isolation.test.js',
        'b-retry.test.js',
        'c-isolation.test.js',
      ],
      0,
      `${pool}: isolation and one-retry assertions`,
    );
    console.log(`${pool}: retry assertion observed two attempts; isolated file state passed`);

    const failureOutput = run(
      process.execPath,
      [
        vitest,
        'run',
        '--root',
        scratch,
        '--config',
        config,
        `--pool=${pool}`,
        '--maxWorkers=1',
        '--minWorkers=1',
        'd-permanent-failure.test.js',
      ],
      1,
      `${pool}: deliberate permanent failure (expected exit 1)`,
    );
    assert.match(failureOutput, /retry x1/);
    assert.match(failureOutput, /synthetic permanent failure/);
    console.log(`${pool}: permanent failure remained visible after retry and returned exit 1`);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
