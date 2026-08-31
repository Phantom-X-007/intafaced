/**
 * ops.admin fleet compose wiring — required BFF shared-secret pass-through.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

export function adminComposeBlock(): string {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const match = compose.match(/^  admin:\n(?:.*\n)*?(?=^  [a-z#]|\Z)/m);
  if (!match) {
    const alt = compose.match(/ADMIN_BFF_SHARED_SECRET[\s\S]{0,200}/);
    if (!alt) throw new Error('apps-admin / ADMIN_BFF block missing from docker-compose.apps.yml');
    return alt[0];
  }
  return match[0];
}

export function adminBffSecretComposeWired(): boolean {
  const block = adminComposeBlock();
  return /ADMIN_BFF_SHARED_SECRET/.test(block);
}
