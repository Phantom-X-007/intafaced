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
