import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CFT_RELATIVE = [
  join('chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
  join('chrome-mac', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
  join('chrome-linux64', 'chrome'),
  join('chrome-linux', 'chrome'),
  join('chrome-win64', 'chrome.exe'),
  join('chrome-win', 'chrome.exe'),
];

function defaultListDir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function defaultIsFile(path) {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function hasChromiumDir(dir, listDir) {
  return listDir(dir).some((name) => name.startsWith('chromium'));
}

function chromiumRevisions(names) {
  return names
    .filter((name) => /^chromium-\d+$/.test(name))
    .sort((a, b) => Number(b.slice('chromium-'.length)) - Number(a.slice('chromium-'.length)));
}

/**
 * Env wins. Else worktree `.tools/ms-playwright` if it has a chromium dir.
 * Else `~/Library/Caches/ms-playwright` if it has chromium. Never an empty path.
 */
export function resolvePlaywrightBrowsersPath({
  env = process.env,
  repoRoot,
  home = env.HOME || homedir(),
  listDir = defaultListDir,
} = {}) {
  const forced = env.PLAYWRIGHT_BROWSERS_PATH;
  if (typeof forced === 'string' && forced.trim() !== '') return forced;

  const worktree = join(repoRoot, '.tools', 'ms-playwright');
  if (hasChromiumDir(worktree, listDir)) return worktree;

  const system = join(home, 'Library', 'Caches', 'ms-playwright');
  if (hasChromiumDir(system, listDir)) return system;

  return undefined;
}

/**
 * Playwright headless prefers chromium_headless_shell. When that revision is
 * missing, point at full Chrome for Testing so launch still works.
 */
export function resolveChromiumExecutablePath(browsersPath, { listDir = defaultListDir, isFile = defaultIsFile } = {}) {
  if (!browsersPath) return undefined;
  const names = listDir(browsersPath);
  if (names.some((name) => name.startsWith('chromium_headless_shell'))) return undefined;

  for (const revision of chromiumRevisions(names)) {
    for (const relative of CFT_RELATIVE) {
      const candidate = join(browsersPath, revision, relative);
      if (isFile(candidate)) return candidate;
    }
  }
  return undefined;
}

export function applyPlaywrightBrowsersEnv({ env = process.env, repoRoot, home, listDir = defaultListDir, isFile = defaultIsFile } = {}) {
  const browsersPath = resolvePlaywrightBrowsersPath({ env, repoRoot, home, listDir });
  if (browsersPath) env.PLAYWRIGHT_BROWSERS_PATH = browsersPath;
  return {
    browsersPath,
    executablePath: resolveChromiumExecutablePath(browsersPath, { listDir, isFile }),
  };
}
