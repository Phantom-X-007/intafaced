#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureToolchain } from './ensure-toolchain.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = ensureToolchain();
const args = process.argv.slice(2);
const r = spawnSync(
  env.MVN,
  ['-q', '-Dmaven.repo.local=' + env.MAVEN_REPO, ...args],
  {
    cwd: ROOT,
    env: { ...process.env, JAVA_HOME: env.JAVA_HOME, PATH: `${join(env.JAVA_HOME, 'bin')}:${process.env.PATH ?? ''}` },
    stdio: 'inherit',
  },
);
process.exit(r.status === null ? 1 : r.status);
