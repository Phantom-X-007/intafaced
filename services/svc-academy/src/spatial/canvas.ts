/**
 * Spatial Stage-2 — 2D canvas product helpers (TRK-academy.spatial).
 *
 * Pure scene mutations for a navigable room canvas. No VR vendor, no chat/PII.
 * Builds on Stage-1 Scene v1 schema (parseScene / SCENE_MAX_BYTES).
 */

import { parseScene, SCENE_VERSION, type SceneV1 } from './scene.js';

export type CanvasErrorCode =
  | 'academy.scene_invalid'
  | 'academy.avatar_missing'
  | 'academy.avatar_exists'
  | 'academy.prop_missing'
  | 'academy.prop_exists'
  | 'academy.out_of_bounds';

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

function commitScene(next: SceneV1): SceneV1 {
  const check = parseScene(next);
  if (!check.ok) throw new CanvasError(check.message, 'academy.scene_invalid');
  return check.scene;
}

/**
 * Host places an avatar. Duplicate id → refuse invent overwrite (use moveAvatar).
 * Position clamped to stage.
 */
export function placeAvatar(
  scene: SceneV1,
  input: { avatarId: string; participantId: string; x: number; y: number; facing?: number },
): SceneV1 {
  if (!input.avatarId?.trim() || !input.participantId?.trim()) {
    throw new CanvasError('avatarId and participantId required', 'academy.scene_invalid');
  }
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
    throw new CanvasError('position must be finite', 'academy.scene_invalid');
  }
  const avatars = scene.avatars ?? [];
  if (avatars.some((a) => a.id === input.avatarId)) {
    throw new CanvasError(`avatar ${input.avatarId} already exists`, 'academy.avatar_exists');
  }
  const pos = clampToStage(scene, input.x, input.y);
  return commitScene({
    version: SCENE_VERSION,
    stage: scene.stage,
    avatars: [
      ...avatars,
      {
        id: input.avatarId,
        participantId: input.participantId,
        position: pos,
        facing: input.facing,
      },
    ],
    props: scene.props,
  });
}

/** Host removes an avatar. Missing → refuse silent no-op invent success. */
export function removeAvatar(scene: SceneV1, avatarId: string): SceneV1 {
  const avatars = scene.avatars ?? [];
  if (!avatars.some((a) => a.id === avatarId)) {
    throw new CanvasError(`avatar ${avatarId} not in scene`, 'academy.avatar_missing');
  }
  return commitScene({
    version: SCENE_VERSION,
    stage: scene.stage,
    avatars: avatars.filter((a) => a.id !== avatarId),
    props: scene.props,
  });
}

/**
 * Host places a prop (furniture / marker). Duplicate id → refuse.
 * Kind is an opaque catalog key — no free-form PII labels.
 */
export function placeProp(scene: SceneV1, input: { propId: string; kind: string; x: number; y: number; rotation?: number }): SceneV1 {
  if (!input.propId?.trim() || !input.kind?.trim()) {
    throw new CanvasError('propId and kind required', 'academy.scene_invalid');
  }
  if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) {
    throw new CanvasError('position must be finite', 'academy.scene_invalid');
  }
  const props = scene.props ?? [];
  if (props.some((p) => p.id === input.propId)) {
    throw new CanvasError(`prop ${input.propId} already exists`, 'academy.prop_exists');
  }
  const pos = clampToStage(scene, input.x, input.y);
  return commitScene({
    version: SCENE_VERSION,
    stage: scene.stage,
    avatars: scene.avatars,
    props: [
      ...props,
      {
        id: input.propId,
        kind: input.kind,
        position: pos,
        rotation: input.rotation,
      },
    ],
  });
}

/** Host removes a prop. Missing → refuse silent invent. */
export function removeProp(scene: SceneV1, propId: string): SceneV1 {
  const props = scene.props ?? [];
  if (!props.some((p) => p.id === propId)) {
    throw new CanvasError(`prop ${propId} not in scene`, 'academy.prop_missing');
  }
  return commitScene({
    version: SCENE_VERSION,
    stage: scene.stage,
    avatars: scene.avatars,
    props: props.filter((p) => p.id !== propId),
  });
}
