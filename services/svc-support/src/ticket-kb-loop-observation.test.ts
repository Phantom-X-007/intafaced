/**
 * Honesty pin — ticket+KB loop is not observed in a live compose env.
 *
 * Proven in unit tests + migrations. Compose `svc-support` health is the
 * generic `/health` liveness alias, not a ticket create + KB search probe.
 * `/ready` must refuse to claim the loop was observed live.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TICKET_KB_LOOP_OBSERVED_IN_LIVE_COMPOSE,
  createTicketKbLoopObserver,
} from './ticket-kb-loop-observation.js';

const COMPOSE = resolve(import.meta.dirname, '../../../docker-compose.apps.yml');
const HTTP_APP = resolve(import.meta.dirname, 'http-app.ts');

function supportServiceBlock(source: string): string {
  const match = source.match(/^  svc-support:\n(?:.*\n)*?(?=^  [a-z]|\Z)/m);
  if (!match) throw new Error('svc-support service block missing from docker-compose.apps.yml');
  return match[0];
}

describe('ticket+KB loop is not observed in a live compose env', () => {
  it('pins the honesty constant: not compose-observed', () => {
    expect(TICKET_KB_LOOP_OBSERVED_IN_LIVE_COMPOSE).toBe(false);
  });

  it('compose declares svc-support with a generic healthcheck, not a ticket+KB probe', () => {
    const block = supportServiceBlock(readFileSync(COMPOSE, 'utf8'));
    expect(block).toMatch(/SERVICE_NAME:\s*svc-support/);
    expect(block).toMatch(/healthcheck:\s*\*healthcheck/);
    expect(block).not.toMatch(/searchKb|createTicket|getKb/);
  });

  it('/ready refuses to claim a live compose ticket+KB observation', () => {
    expect(TICKET_KB_LOOP_OBSERVED_IN_LIVE_COMPOSE).toBe(false);
    const src = readFileSync(HTTP_APP, 'utf8');
    expect(src).toMatch(/ticketKbLoopObservedInLiveCompose:\s*TICKET_KB_LOOP_OBSERVED_IN_LIVE_COMPOSE/);
  });

  it('process observer starts at zeros and only advances on mark', () => {
    const loop = createTicketKbLoopObserver();
    expect(loop.snapshot()).toEqual({
      lastTicketCreateAtMs: 0,
      lastKbSearchAtMs: 0,
      lastKbGetAtMs: 0,
    });
    const before = Date.now();
    loop.markTicketCreateSuccess();
    loop.markKbSearchSuccess();
    loop.markKbGetSuccess();
    const snap = loop.snapshot();
    expect(snap.lastTicketCreateAtMs).toBeGreaterThanOrEqual(before);
    expect(snap.lastKbSearchAtMs).toBeGreaterThanOrEqual(before);
    expect(snap.lastKbGetAtMs).toBeGreaterThanOrEqual(before);
  });
});
