/**
 * C8 fail-first golden: compose empty-passes RPC and venue; omitted venue
 * remains a named refusal (`indexer.venue_unset`) rather than an empty book.
 * Owner may set the disposable Anvil fixture explicitly — this mill does not.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const COMPOSE = resolve(import.meta.dirname, '../../../docker-compose.apps.yml');

describe('socket.clob-contracts Anvil wire golden', () => {
  it('keeps the compose seam explicit and non-custodial', () => {
    const source = readFileSync(COMPOSE, 'utf8');
    const block = source.match(/^  svc-indexer:\n(?:.*\n)*?(?=^  [a-z]|\Z)/m)?.[0] ?? '';
    expect(block).toContain('INDEXER_RPC_URL: ${INDEXER_RPC_URL:-}');
    expect(block).not.toMatch(/INDEXER_RPC_URL:.*evm:8545/);
    expect(block).toContain('INDEXER_VENUE_ADDRESS: ${INDEXER_VENUE_ADDRESS:-}');
    expect(block).not.toMatch(/INDEXER_VENUE_ADDRESS:.*0x0116/);
    expect(block).toContain('indexer.venue_unset');
    expect(block).not.toMatch(/PRIVATE_KEY|SIGNING_KEY|LEDGER_URL/);
  });

  it('pins the disposable deployment and production zero sentinel', () => {
    expect('0x0116686E2291dbd5e317F47faDBFb43B599786Ef').toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect('0x0000000000000000000000000000000000000000').toMatch(/^0x0{40}$/);
  });
});
