/**
 * Spatial Stage-2 L3 — reconnect restore (TRK-academy.spatial).
 *
 * Server scene is SoT after reconnect. Local draft never invents server state
 * when the server already has a valid v1 scene.
 */

import { emptyScene, parseScene, type SceneV1 } from './scene.js';

export type ReconnectOk = {
  readonly status: 'ok';
  readonly scene: SceneV1;
  readonly source: 'server' | 'local_draft' | 'empty_default';
};

export type ReconnectRefuse = {
  readonly status: 'refuse';
  readonly reason: 'server_invalid' | 'local_invalid';
  readonly message: string;
};

export type ReconnectResult = ReconnectOk | ReconnectRefuse;

/**
 * Choose scene after client reconnect.
 * - Valid server scene → always server (local draft discarded).
 * - Server null/undefined → local draft if valid.
 * - Both missing → empty default scene (not invent props/avatars).
 * - Server present but invalid → refuse (do not fall back to local invent).
 */
export function restoreSceneOnReconnect(input: { serverScene: unknown | null | undefined; localDraft?: unknown | null }): ReconnectResult {
  if (input.serverScene != null) {
    const server = parseScene(input.serverScene);
    if (!server.ok) {
      return { status: 'refuse', reason: 'server_invalid', message: server.message };
    }
    return { status: 'ok', scene: server.scene, source: 'server' };
  }

  if (input.localDraft != null) {
    const local = parseScene(input.localDraft);
    if (!local.ok) {
      return { status: 'refuse', reason: 'local_invalid', message: local.message };
    }
    return { status: 'ok', scene: local.scene, source: 'local_draft' };
  }

  return { status: 'ok', scene: emptyScene(), source: 'empty_default' };
}

/** L3 — true when reconnect ok. */
export function isReconnectOk(result: ReconnectResult): result is ReconnectOk {
  return result.status === 'ok';
}

/** L3 — true when reconnect refused. */
export function isReconnectRefused(result: ReconnectResult): result is ReconnectRefuse {
  return result.status === 'refuse';
}

/** L3 — source label or refuse reason. */
export function reconnectSourceLabel(result: ReconnectResult): string {
  return result.status === 'ok' ? result.source : result.reason;
}

/** L3 — reconnect board card. */
export function reconnectBoardCard(result: ReconnectResult): {
  readonly ok: boolean;
  readonly source: string;
  readonly refused: boolean;
} {
  return {
    ok: isReconnectOk(result),
    source: reconnectSourceLabel(result),
    refused: isReconnectRefused(result),
  };
}

/** L3 — reconnect status line. */
export function reconnectStatusLine(result: ReconnectResult): string {
  const c = reconnectBoardCard(result);
  return `ok=${c.ok ? '1' : '0'} source=${c.source} refused=${c.refused ? '1' : '0'}`;
}

/** L3 — parse reconnect status. Invalid → null. */
export function parseReconnectStatusLine(
  line: string,
): { readonly ok: boolean; readonly source: string; readonly refused: boolean } | null {
  const m = line.trim().match(/^ok=([01]) source=(\S+) refused=([01])$/);
  if (!m) return null;
  return { ok: m[1] === '1', source: m[2]!, refused: m[3] === '1' };
}

/** L3 — true when status matches result. */
export function reconnectStatusLineMatches(result: ReconnectResult): boolean {
  const p = parseReconnectStatusLine(reconnectStatusLine(result));
  if (!p) return false;
  const c = reconnectBoardCard(result);
  return p.ok === c.ok && p.source === c.source && p.refused === c.refused;
}

/** L3 — export header. */
export function reconnectExportHeader(): string {
  return 'status,source';
}

/** L3 — export line. */
export function reconnectExportLine(result: ReconnectResult): string {
  return `${result.status},${reconnectSourceLabel(result)}`;
}

/** L3 — full export text. */
export function reconnectExportText(result: ReconnectResult): string {
  return [reconnectExportHeader(), reconnectExportLine(result)].join('\n');
}

/** L3 — true when source is server. */
export function isServerSourced(result: ReconnectResult): boolean {
  return result.status === 'ok' && result.source === 'server';
}

/** L3 — true when empty default. */
export function isEmptyDefaultReconnect(result: ReconnectResult): boolean {
  return result.status === 'ok' && result.source === 'empty_default';
}
