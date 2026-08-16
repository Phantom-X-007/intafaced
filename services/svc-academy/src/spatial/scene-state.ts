/**
 * Durable 2D scene state (TRK-academy.spatial).
 *
 * Persist/load the serializable Scene v1 blob. Empty stored state is honest
 * empty — callers must not invent a 1000×1000 fake room. Using an empty
 * scene as a navigable room refuses with `academy.scene_empty`.
 *
 * Not a Vue canvas. Not a VR product. Tracker stays open until a user
 * can actually navigate a room.
 *
 * Leverage: Phase A IN — extend existing `parseScene` / `emptyScene`.
 */

import { emptyScene, parseScene, type SceneV1 } from './scene.js';

/** Named refuse when durable state has no stage, avatars, or props. */
export const SCENE_EMPTY_REFUSE = 'academy.scene_empty' as const;

export type SceneOccupancy = 'empty' | 'populated';

export type SceneStateOk = {
  readonly ok: true;
  readonly scene: SceneV1;
  readonly occupancy: SceneOccupancy;
  readonly source: 'stored' | 'empty_default';
};

export type SceneStateErr = {
  readonly ok: false;
  readonly reason: 'invalid' | 'oversized';
  readonly message: string;
};

export type SceneStateResult = SceneStateOk | SceneStateErr;

export type RequirePopulatedOk = { readonly ok: true; readonly scene: SceneV1 };
export type RequirePopulatedRefuse = {
  readonly ok: false;
  readonly reason: typeof SCENE_EMPTY_REFUSE;
  readonly message: string;
};
export type RequirePopulatedResult = RequirePopulatedOk | RequirePopulatedRefuse;

function isBlankStored(stored: unknown): boolean {
  if (stored == null) return true;
  if (typeof stored !== 'object' || Array.isArray(stored)) return false;
  return Object.keys(stored).length === 0;
}

/** True when the scene has no stage, no avatars, and no props. */
export function isDurableSceneEmpty(scene: SceneV1): boolean {
  const noAvatars = scene.avatars == null || scene.avatars.length === 0;
  const noProps = scene.props == null || scene.props.length === 0;
  return scene.stage == null && noAvatars && noProps;
}

function okFromScene(scene: SceneV1, source: SceneStateOk['source']): SceneStateOk {
  return {
    ok: true,
    scene,
    occupancy: isDurableSceneEmpty(scene) ? 'empty' : 'populated',
    source,
  };
}

/**
 * Persist: validate a host write, then return the jsonb-ready scene.
 * Empty v1 is allowed to store (honest empty). Invalid/oversized refuse.
 */
export function persistSceneState(input: unknown): SceneStateResult {
  const parsed = parseScene(input);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, message: parsed.message };
  }
  return okFromScene(parsed.scene, 'stored');
}

/**
 * Load stored jsonb. Missing / `{}` (legacy DB default) → honest empty v1.
 * Present but invalid → refuse (do not invent a room).
 */
export function loadSceneState(stored: unknown): SceneStateResult {
  if (isBlankStored(stored)) {
    return okFromScene(emptyScene(), 'empty_default');
  }
  const parsed = parseScene(stored);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, message: parsed.message };
  }
  return okFromScene(parsed.scene, 'stored');
}

/**
 * Named refuse when durable state is empty. Does not return a default stage.
 */
export function requirePopulatedScene(scene: SceneV1): RequirePopulatedResult {
  if (isDurableSceneEmpty(scene)) {
    return {
      ok: false,
      reason: SCENE_EMPTY_REFUSE,
      message: 'scene is empty — no stage, avatars, or props; refuse fake room',
    };
  }
  return { ok: true, scene };
}
