/**
 * Spatial Stage-2 — 2D canvas product helpers (TRK-academy.spatial).
 *
 * Pure scene mutations for a navigable room canvas. No VR vendor, no chat/PII.
 * Builds on Stage-1 Scene v1 schema (parseScene / SCENE_MAX_BYTES).
 */

import { parseScene, SCENE_VERSION, type SceneV1 } from './scene.js';

export type CanvasErrorCode = 'academy.scene_invalid' | 'academy.avatar_missing' | 'academy.out_of_bounds';

export class CanvasError extends Error {
  constructor(
    message: string,
    readonly code: CanvasErrorCode,
  ) {
    super(message);
    this.name = 'CanvasError';
  }
}

function stageBounds(scene: SceneV1): { width: number; height: number } {
  return {
    width: scene.stage?.width ?? 1000,
    height: scene.stage?.height ?? 1000,
  };
}

/** Clamp a point into the stage rectangle (inclusive edges). */
export function clampToStage(scene: SceneV1, x: number, y: number): { x: number; y: number } {
  const { width, height } = stageBounds(scene);
  return {
    x: Math.min(Math.max(0, x), width),
    y: Math.min(Math.max(0, y), height),
  };
}

/**
 * Move one avatar by delta. Missing avatar → error (no invent ghost).
 * Out-of-bounds positions are clamped, not rejected, so UI drag stays continuous.
 */
export function moveAvatar(scene: SceneV1, input: { avatarId: string; dx: number; dy: number }): SceneV1 {
  if (!Number.isFinite(input.dx) || !Number.isFinite(input.dy)) {
    throw new CanvasError('delta must be finite', 'academy.scene_invalid');
  }
  const avatars = scene.avatars ?? [];
  const idx = avatars.findIndex((a) => a.id === input.avatarId);
  if (idx < 0) {
    throw new CanvasError(`avatar ${input.avatarId} not in scene`, 'academy.avatar_missing');
  }
  const cur = avatars[idx]!;
  const nextPos = clampToStage(scene, cur.position.x + input.dx, cur.position.y + input.dy);
  const nextAvatars = avatars.slice();
  nextAvatars[idx] = { ...cur, position: nextPos };
  const next: SceneV1 = {
    version: SCENE_VERSION,
    stage: scene.stage,
    avatars: nextAvatars,
    props: scene.props,
  };
  const check = parseScene(next);
  if (!check.ok) {
    throw new CanvasError(check.message, 'academy.scene_invalid');
  }
  return check.scene;
}

/** Presence list for UI — ids only, no labels that could smuggle PII. */
export function listPresence(scene: SceneV1): readonly { avatarId: string; participantId: string; x: number; y: number }[] {
  return (scene.avatars ?? []).map((a) => ({
    avatarId: a.id,
    participantId: a.participantId,
    x: a.position.x,
    y: a.position.y,
  }));
}

/** Ensure stage exists with default size for canvas product. */
export function ensureStage(scene: SceneV1, size: { width: number; height: number } = { width: 1000, height: 1000 }): SceneV1 {
  if (scene.stage) return scene;
  const next: SceneV1 = {
    version: SCENE_VERSION,
    stage: { width: size.width, height: size.height },
    avatars: scene.avatars,
    props: scene.props,
  };
  const check = parseScene(next);
  if (!check.ok) throw new CanvasError(check.message, 'academy.scene_invalid');
  return check.scene;
}
