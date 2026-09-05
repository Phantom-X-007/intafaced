import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AGENTS_SUPPORT_ASSIST,
  DESK_DOES_NOT,
  DESK_OWNS,
  DESK_STAGE,
  OPS_SUPPORT_MOUNTAIN,
  deskVsAgentSplit,
} from './desk-vs-agent-split.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('D26-P1-O3 desk vs agent surface split', () => {
  it('names distinct mountains and keeps the desk standalone', () => {
    const split = deskVsAgentSplit();
    expect(split.deskMountain).toBe(OPS_SUPPORT_MOUNTAIN);
    expect(split.agentAssist).toBe(AGENTS_SUPPORT_ASSIST);
    expect(split.deskMountain).not.toBe(split.agentAssist);
    expect(split.deskStandalone).toBe(true);
    expect(split.stage).toBe(DESK_STAGE);
    expect(split.accountStateSource).toBe('svc-identity');
    expect(DESK_OWNS).toContain('ticket_events_audit');
    expect(DESK_DOES_NOT).toContain('invent_ledger_balances');
    expect(DESK_DOES_NOT).toContain('metered_agent_sessions');
  });

  it('composition root /ready advertises the same stage + identity account source', () => {
    const src = readFileSync(join(here, 'http-app.ts'), 'utf8');
    expect(src).toMatch(/deskVsAgentSplit/);
    expect(src).toMatch(/stage:\s*split\.stage/);
    expect(src).toMatch(/accountStateSource:\s*split\.accountStateSource/);
    expect(src).toMatch(/deskMountain:\s*split\.deskMountain/);
    expect(src).toMatch(/agentAssist:\s*split\.agentAssist/);
    expect(src).toMatch(/supportHealthHonesty/);
    expect(src).toMatch(/identityGroundingRefuse/);
    expect(src).toMatch(/supportStoreHonesty/);
    expect(src).toMatch(/canSettle:\s*settlement\.canSettle/);
  });

  it('desk service never imports ledger-client (no invent balances)', () => {
    const src = readFileSync(join(here, 'index.ts'), 'utf8');
    expect(src).not.toMatch(/@intafaced\/ledger-client|LedgerClient|recipes\./);
  });
});
