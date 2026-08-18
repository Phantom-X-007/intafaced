import { describe, expect, it } from 'vitest';
import {
  FREEZE_AUTHORITY_FLAG_KEY,
  assertFreezeAuthority,
  freezeAuthorityNote,
  inventFreezeOutsideLedger,
  listFreezeAuthorities,
} from './freeze-authority.js';
import { enforcementOf } from './flags.js';

/**
 * Unit card (L16 W9)
 * Promise: Engine A admin kill residual — cannot invent freeze outside ledger.
 * Break: free-string freeze labels paint halt the book never wrote.
 * Done bar: only ledger.posting operator-api is freeze authority; invent refused.
 * Class N · packages/config only · no money movement.
 */

describe('listFreezeAuthorities', () => {
  it('is exactly ledger.posting', () => {
    const list = listFreezeAuthorities();
    expect(list).toHaveLength(1);
    expect(list[0]?.key).toBe(FREEZE_AUTHORITY_FLAG_KEY);
    expect(list[0]?.enforcement.kind).toBe('operator-api');
  });
});

describe('assertFreezeAuthority', () => {
  it('accepts ledger.posting as the sole freeze authority', () => {
    const r = assertFreezeAuthority('ledger.posting');
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error('unreachable');
    expect(r.enforcement.kind).toBe('operator-api');
    expect(r.enforcement.service).toBe('svc-ledger');
    expect(r.enforcement.surface).toContain('freeze');
  });

  it('refuses trade.spot — service-env is not a book freeze', () => {
    expect(enforcementOf('trade.spot').kind).toBe('service-env');
    const r = assertFreezeAuthority('trade.spot');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('refuse.not_freeze_authority');
  });

  it('refuses edge.gateway — launch-plan entry is not a freeze', () => {
    const r = assertFreezeAuthority('edge.gateway');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('refuse.not_freeze_authority');
  });

  it('refuses unknown invent keys', () => {
    const r = assertFreezeAuthority('ops.inventFreeze');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('refuse.unknown_flag');
  });

  it('refuses empty key', () => {
    const r = assertFreezeAuthority('  ');
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error('unreachable');
    expect(r.code).toBe('refuse.unknown_flag');
  });
});

describe('inventFreezeOutsideLedger', () => {
  it('refuses free-prose freeze labels', () => {
    for (const label of ['trade freeze', 'pay freeze', 'freeze everything', 'module-kill']) {
      const r = inventFreezeOutsideLedger(label);
      expect(r.ok, label).toBe(false);
    }
  });

  it('still accepts the real key', () => {
    expect(inventFreezeOutsideLedger('ledger.posting').ok).toBe(true);
  });
});

describe('freezeAuthorityNote', () => {
  it('names ledger surface and env', () => {
    const note = freezeAuthorityNote();
    expect(note).toContain('ledger.posting');
    expect(note).toContain('LEDGER_POSTING_ENABLED');
    expect(note).toContain('svc-ledger');
  });
});
