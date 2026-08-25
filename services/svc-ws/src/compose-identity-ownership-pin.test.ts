/**
 * Compose pin — svc-ws receives IDENTITY_URL + IDENTITY_OWNERSHIP_SECRET.
 *
 * Fleet HMAC is interpolated into IDENTITY_OWNERSHIP_SECRET. The container
 * key INTERNAL_SERVICE_SECRET is not assigned, and *internal-secret is not
 * merged onto this service.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPOSE = resolve(import.meta.dirname, '../../../docker-compose.apps.yml');

function wsServiceBlock(source: string): string {
  const match = source.match(/^  svc-ws:\n(?:.*\n)*?(?=^  [a-z]|\Z)/m);
  if (!match) throw new Error('svc-ws service block missing from docker-compose.apps.yml');
  return match[0];
}

function countAssignments(source: string, name: string): number {
  const re = new RegExp(`^\\s*${name}:`, 'gm');
  return source.match(re)?.length ?? 0;
}

const IDENTITY_URL = /^\s+IDENTITY_URL:\s*http:\/\/svc-identity:4002\s*$/gm;
const OWNERSHIP = /^\s+IDENTITY_OWNERSHIP_SECRET:\s*\$\{INTERNAL_SERVICE_SECRET:\?missing — copy \.env\.example to \.env\}\s*$/gm;

describe('compose identity ownership door for svc-ws', () => {
  const compose = readFileSync(COMPOSE, 'utf8');
  const block = wsServiceBlock(compose);

  it('wires IDENTITY_URL and IDENTITY_OWNERSHIP_SECRET once; interpolates fleet HMAC', () => {
    expect(block).toMatch(/SERVICE_NAME:\s*svc-ws/);
    expect(block.match(IDENTITY_URL)).toHaveLength(1);
    expect(block.match(OWNERSHIP)).toHaveLength(1);
    expect(countAssignments(block, 'IDENTITY_URL')).toBe(1);
    expect(countAssignments(block, 'IDENTITY_OWNERSHIP_SECRET')).toBe(1);
  });

  it('does not merge *internal-secret or assign INTERNAL_SERVICE_SECRET on the container', () => {
    expect(block).not.toMatch(/\*internal-secret/);
    expect(block).not.toMatch(/^\s+INTERNAL_SERVICE_SECRET:/m);
    expect(block).not.toMatch(/^\s+EDGE_PRINCIPAL_SECRET:/m);
  });
});
