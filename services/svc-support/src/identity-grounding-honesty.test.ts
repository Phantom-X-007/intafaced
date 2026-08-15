import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IDENTITY_GROUNDING_UNWIRED, composePretendsGroundingLoopServing, identityGroundingProof } from './identity-grounding-honesty.js';

const COMPOSE = resolve(import.meta.dirname, '../../../docker-compose.apps.yml');

function serviceBlock(source: string, name: string): string {
  const match = source.match(new RegExp(`^  ${name}:\\n(?:.*\\n)*?(?=^  [a-z]|\\Z)`, 'm'));
  if (!match) throw new Error(`${name} service block missing from docker-compose.apps.yml`);
  return match[0];
}

describe('identity grounding honesty (D26-P1-O3)', () => {
  it('names support.identity_grounding_unwired when the S2S secret is blank', () => {
    expect(identityGroundingProof('')).toEqual({ wired: false, refuse: IDENTITY_GROUNDING_UNWIRED });
    expect(identityGroundingProof('   ')).toEqual({ wired: false, refuse: IDENTITY_GROUNDING_UNWIRED });
    expect(identityGroundingProof(undefined)).toEqual({ wired: false, refuse: IDENTITY_GROUNDING_UNWIRED });
    expect(identityGroundingProof(null)).toEqual({ wired: false, refuse: IDENTITY_GROUNDING_UNWIRED });
  });

  it('is wired only when a non-empty secret is present', () => {
    expect(identityGroundingProof('an-internal-service-secret-long-enough')).toEqual({
      wired: true,
      refuse: null,
    });
  });

  it('detects compose that claims IDENTITY_URL without the internal secret', () => {
    const dishonest = [
      '  svc-support:',
      '    environment:',
      '      SERVICE_NAME: svc-support',
      '      IDENTITY_URL: http://svc-identity:4002',
      '',
    ].join('\n');
    expect(composePretendsGroundingLoopServing(dishonest)).toBe(true);
  });

  it('fails if shipped compose pretends the grounding loop is serving without the secret', () => {
    const block = serviceBlock(readFileSync(COMPOSE, 'utf8'), 'svc-support');
    expect(composePretendsGroundingLoopServing(block)).toBe(false);
    expect(block).toMatch(/\*internal-secret/);
    expect(block).toMatch(/IDENTITY_URL:\s*http:\/\/svc-identity:4002/);
  });
});
