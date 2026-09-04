import assert from 'node:assert/strict';
import test from 'node:test';
import { join } from 'node:path';
import { resolveChromiumExecutablePath, resolvePlaywrightBrowsersPath } from './playwright-browsers.mjs';

const REPO = '/wt/intafaced';
const HOME = '/Users/Nitro';
const WORKTREE = join(REPO, '.tools', 'ms-playwright');
const SYSTEM = join(HOME, 'Library', 'Caches', 'ms-playwright');
const CFT = join('chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');

function listFrom(map) {
  return (dir) => map[dir] ?? [];
}

test('keeps PLAYWRIGHT_BROWSERS_PATH when already set', () => {
  const path = resolvePlaywrightBrowsersPath({
    env: { PLAYWRIGHT_BROWSERS_PATH: '/forced/browsers' },
    repoRoot: REPO,
    home: HOME,
    listDir: listFrom({
      [WORKTREE]: ['chromium-1'],
      [SYSTEM]: ['chromium-1234'],
    }),
  });
  assert.equal(path, '/forced/browsers');
});

test('uses worktree .tools/ms-playwright when it has a chromium dir', () => {
  const path = resolvePlaywrightBrowsersPath({
    env: {},
    repoRoot: REPO,
    home: HOME,
    listDir: listFrom({
      [WORKTREE]: ['chromium-9'],
      [SYSTEM]: ['chromium-1234'],
    }),
  });
  assert.equal(path, WORKTREE);
});

test('falls back to ~/Library/Caches/ms-playwright when worktree has no chromium', () => {
  const path = resolvePlaywrightBrowsersPath({
    env: {},
    repoRoot: REPO,
    home: HOME,
    listDir: listFrom({
      [WORKTREE]: ['ffmpeg-1011'],
      [SYSTEM]: ['chromium-1234', 'chromium_headless_shell-1234'],
    }),
  });
  assert.equal(path, SYSTEM);
});

test('does not invent an empty worktree browsers path', () => {
  const path = resolvePlaywrightBrowsersPath({
    env: {},
    repoRoot: REPO,
    home: HOME,
    listDir: listFrom({
      [WORKTREE]: [],
      [SYSTEM]: [],
    }),
  });
  assert.equal(path, undefined);
});

test('prefers full Chrome for Testing when headless_shell is absent', () => {
  const browsers = '/cache/ms-playwright';
  const exe = join(browsers, 'chromium-1234', CFT);
  const path = resolveChromiumExecutablePath(browsers, {
    listDir: listFrom({ [browsers]: ['chromium-1234'] }),
    isFile: (candidate) => candidate === exe,
  });
  assert.equal(path, exe);
});

test('leaves executable unset when headless_shell is present', () => {
  const browsers = '/cache/ms-playwright';
  const path = resolveChromiumExecutablePath(browsers, {
    listDir: listFrom({
      [browsers]: ['chromium-1234', 'chromium_headless_shell-1234'],
    }),
    isFile: () => true,
  });
  assert.equal(path, undefined);
});
