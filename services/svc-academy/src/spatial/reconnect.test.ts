import { describe, expect, it } from 'vitest';
import {
  restoreSceneOnReconnect,
  isReconnectOk,
  isReconnectRefused,
  reconnectSourceLabel,
  reconnectBoardCard,
  reconnectStatusLine,
  parseReconnectStatusLine,
  reconnectStatusLineMatches,
  reconnectExportHeader,
  reconnectExportLine,
  reconnectExportText,
  isServerSourced,
  isEmptyDefaultReconnect,
} from './reconnect.js';

describe('spatial L3 reconnect restore', () => {
  const server = {
    version: 1 as const,
    stage: { width: 100, height: 100 },
    avatars: [{ id: 'a1', participantId: 'p1', position: { x: 1, y: 2 } }],
  };
  const local = {
    version: 1 as const,
    stage: { width: 50, height: 50 },
    avatars: [{ id: 'ghost', participantId: 'g', position: { x: 9, y: 9 } }],
  };

  it('prefers valid server over local draft', () => {
    const r = restoreSceneOnReconnect({ serverScene: server, localDraft: local });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.source).toBe('server');
    expect(r.scene.avatars![0]!.id).toBe('a1');
  });

  it('uses local draft only when server missing', () => {
    const r = restoreSceneOnReconnect({ serverScene: null, localDraft: local });
    expect(r).toMatchObject({ status: 'ok', source: 'local_draft' });
  });

  it('empty default when both missing — no invent avatars', () => {
    const r = restoreSceneOnReconnect({ serverScene: null, localDraft: null });
    expect(r).toMatchObject({ status: 'ok', source: 'empty_default' });
    if (r.status === 'ok') {
      expect(r.scene).toEqual({ version: 1 });
      expect(r.scene.avatars).toBeUndefined();
    }
  });

  it('invalid server refuses — does not fall back to local invent', () => {
    const r = restoreSceneOnReconnect({ serverScene: { version: 99 }, localDraft: local });
    expect(r.status).toBe('refuse');
    if (r.status === 'refuse') expect(r.reason).toBe('server_invalid');
  });
});

describe('L3 wave49 reconnect status/export', () => {
  const server = {
    version: 1 as const,
    stage: { width: 100, height: 100 },
    avatars: [{ id: 'a1', participantId: 'p1', position: { x: 1, y: 2 } }],
  };

  it('status and export for ok/refuse', () => {
    const ok = restoreSceneOnReconnect({ serverScene: server, localDraft: null });
    expect(isReconnectOk(ok)).toBe(true);
    expect(isServerSourced(ok)).toBe(true);
    expect(reconnectSourceLabel(ok)).toBe('server');
    expect(reconnectStatusLineMatches(ok)).toBe(true);
    expect(reconnectExportText(ok).startsWith(reconnectExportHeader())).toBe(true);
    expect(reconnectExportLine(ok)).toBe('ok,server');
    expect(parseReconnectStatusLine('nope')).toBeNull();

    const empty = restoreSceneOnReconnect({ serverScene: null, localDraft: null });
    expect(isEmptyDefaultReconnect(empty)).toBe(true);
    expect(reconnectBoardCard(empty).ok).toBe(true);

    const bad = restoreSceneOnReconnect({ serverScene: { version: 99 }, localDraft: null });
    expect(isReconnectRefused(bad)).toBe(true);
    expect(reconnectStatusLine(bad)).toContain('refused=1');
    expect(reconnectStatusLineMatches(bad)).toBe(true);
  });
});
