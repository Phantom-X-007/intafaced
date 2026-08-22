/**
 * connect.data-lake fleet compose wiring — TSDB URL + retention owner env pass-through.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function edgeComposeBlock(): string {
  const compose = readFileSync(join(ROOT, 'docker-compose.apps.yml'), 'utf8');
  const match = compose.match(/^  svc-edge:\n(?:.*\n)*?(?=^  [a-z#]|\Z)/m);
  if (!match) throw new Error('svc-edge service block missing from docker-compose.apps.yml');
  return match[0];
}

export function connectLakeTsdbInitPresent(): boolean {
  return existsSync(join(ROOT, 'tooling/infra/postgres-init/03-connect-lake.sql'));
}

export function connectLakeTsdbComposeWired(): boolean {
  const block = edgeComposeBlock();
  return (
    connectLakeTsdbInitPresent() &&
    /CONNECT_DATA_LAKE_TSDB_URL:\s*postgres:\/\/svc_connect_lake:svc_connect_lake@postgres:5432\/intafaced/.test(block)
  );
}

export function connectLakeRetentionOwnerEnvComposeWired(): boolean {
  const block = edgeComposeBlock();
  return /^\s+CONNECT_DATA_LAKE_RETENTION_DAYS:\s*$/m.test(block);
}
