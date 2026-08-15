import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Honesty pin for infra.i18n.
 *
 * §9 wants every surface keyed. Tracker truth is the opposite: no product app
 * or product service imports `@intafaced/i18n` yet. `svc-notify` renders
 * out-of-app copy from this package; that is not a product surface. This suite
 * fails if a product workspace starts depending on the package without the
 * mountain actually keying screens — so we cannot invent a 100-language
 * product by adding a catalog and calling it shipped.
 *
 * When a real surface keys, update PRODUCT_ROOTS / the notify allowlist here
 * in the same PR that wires the import. Do not loosen the scan to stay green.
 */

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const I18N = '@intafaced/i18n';
const IMPORT_RE = /['"]@intafaced\/i18n(?:\/[^'"]*)?['"]/;

/** Product UI + product services. Backend notify copy is not a surface. */
const PRODUCT_ROOTS = ['apps', 'services'] as const;
const ALLOWED_SERVICE_DIRS = new Set(['svc-notify']);

const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage', '.git']);
const SOURCE_EXT = /\.(?:[cm]?[jt]sx?|vue|json)$/;

function listDirs(parent: string): string[] {
  try {
    return readdirSync(parent, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

function walkFiles(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (SOURCE_EXT.test(entry.name)) out.push(full);
  }
}

function productWorkspaces(): { name: string; dir: string }[] {
  const rows: { name: string; dir: string }[] = [];
  for (const root of PRODUCT_ROOTS) {
    const parent = join(REPO_ROOT, root);
    for (const name of listDirs(parent)) {
      if (root === 'services' && ALLOWED_SERVICE_DIRS.has(name)) continue;
      const dir = join(parent, name);
      try {
        if (statSync(join(dir, 'package.json')).isFile()) rows.push({ name: `${root}/${name}`, dir });
      } catch {
        /* not a workspace */
      }
    }
  }
  return rows;
}

const WORKSPACES = productWorkspaces();

describe('@intafaced/i18n — zero product consumers until surfaces key it', () => {
  it('finds product workspaces (otherwise this pin is vacuous)', () => {
    expect(WORKSPACES.length).toBeGreaterThan(5);
    expect(WORKSPACES.some((w) => w.name.startsWith('apps/'))).toBe(true);
    expect(WORKSPACES.some((w) => w.name.startsWith('services/'))).toBe(true);
    expect(WORKSPACES.some((w) => w.name === 'services/svc-notify')).toBe(false);
  });

  it('has no product package.json depending on the package', () => {
    const hits: string[] = [];
    for (const ws of WORKSPACES) {
      const pkg = JSON.parse(readFileSync(join(ws.dir, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      if (pkg.dependencies?.[I18N] || pkg.devDependencies?.[I18N]) hits.push(ws.name);
    }
    expect(hits, hits.join(', ')).toEqual([]);
  });

  it('has no product source importing the package', () => {
    const hits: string[] = [];
    for (const ws of WORKSPACES) {
      const files: string[] = [];
      walkFiles(ws.dir, files);
      for (const file of files) {
        if (file.endsWith(`${join('')}package.json`.replace(join(''), 'package.json')) && file.endsWith('package.json')) {
          continue;
        }
        const text = readFileSync(file, 'utf8');
        if (IMPORT_RE.test(text)) hits.push(file.slice(REPO_ROOT.length));
      }
    }
    expect(hits, hits.join('\n')).toEqual([]);
  });
});
