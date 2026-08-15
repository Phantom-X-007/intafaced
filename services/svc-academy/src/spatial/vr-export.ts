/**
 * Spatial Stage-3 — VR-ready scene export (§8.3).
 *
 * Vendor-neutral adapter DTO: versioned 2D scene → id + xyz + facing.
 * No named VR runtime (§13). No Vue/shell. No SFU. No PII keys
 * (email / chat / token / participantId / labelKey / backgroundKey).
 *
 * Spec: docs/ops/trk/academy.spatial.md Stage 3.
 * Leverage: Phase A IN — SceneV1 + parseScene + SCENE_MAX_BYTES + canvas stage defaults.
 */

import { AcademyError } from '../errors.js';
import { parseScene, SCENE_MAX_BYTES, SCENE_VERSION, type SceneV1 } from './scene.js';

/** Adapter DTO version. Independent of Scene v1 so a VR client can pin this surface. */
export const VR_SCENE_VERSION = 1 as const;

/** Default stage when Scene v1 omitted bounds (same as canvas.ts). */
const DEFAULT_STAGE = { width: 1000, height: 1000 } as const;

/** 2D canvas lives on XY; Z is the floor plane (always 0). */
const FLOOR_Z = 0;

export type VrAvatarV1 = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly facing: number;
};

export type VrPropV1 = {
  readonly id: string;
  readonly kind: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type VrStageV1 = {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
};

/**
 * Closed VR adapter DTO. Unknown keys must never appear — adapters must not
 * smuggle chat/email/tokens through this export.
 */
export type VrSceneV1 = {
  readonly version: typeof VR_SCENE_VERSION;
  readonly stage: VrStageV1;
  readonly avatars: readonly VrAvatarV1[];
  readonly props: readonly VrPropV1[];
};

export type ExportVrSceneOk = { ok: true; dto: VrSceneV1; bytes: number };
export type ExportVrSceneErr = { ok: false; reason: 'invalid' | 'oversized'; message: string };
export type ExportVrSceneResult = ExportVrSceneOk | ExportVrSceneErr;

function mapScene(scene: SceneV1): VrSceneV1 {
  const width = scene.stage?.width ?? DEFAULT_STAGE.width;
  const height = scene.stage?.height ?? DEFAULT_STAGE.height;
  return {
    version: VR_SCENE_VERSION,
    stage: { width, height, depth: FLOOR_Z },
    avatars: (scene.avatars ?? []).map((a) => ({
      id: a.id,
      x: a.position.x,
      y: a.position.y,
      z: FLOOR_Z,
      facing: a.facing ?? 0,
    })),
    props: (scene.props ?? []).map((p) => ({
      id: p.id,
      kind: p.kind,
      x: p.position.x,
      y: p.position.y,
      z: FLOOR_Z,
    })),
  };
}

/**
 * Serialize Scene v1 for a VR adapter. Invalid/oversized input refuses —
 * never invents avatars. Export JSON must stay ≤ SCENE_MAX_BYTES.
 */
export function exportVrScene(input: unknown): ExportVrSceneResult {
  const parsed = parseScene(input);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason, message: parsed.message };
  }

  const dto = mapScene(parsed.scene);
  let encoded: string;
  try {
    encoded = JSON.stringify(dto);
  } catch {
    return { ok: false, reason: 'invalid', message: 'VR scene is not JSON-serializable' };
  }
  const bytes = Buffer.byteLength(encoded, 'utf8');
  if (bytes > SCENE_MAX_BYTES) {
    return {
      ok: false,
      reason: 'oversized',
      message: `VR export exceeds ${SCENE_MAX_BYTES} bytes (got ${bytes})`,
    };
  }
  return { ok: true, dto, bytes };
}

/** Throw AcademyError on bad/oversized scene — for service use. */
export function assertExportVrScene(input: unknown): VrSceneV1 {
  const r = exportVrScene(input);
  if (!r.ok) {
    throw new AcademyError(r.message, 'academy.scene_invalid');
  }
  return r.dto;
}

/** Keys that must never appear in a VR export (PII / secrets / seat labels). */
export const VR_EXPORT_FORBIDDEN_KEYS = ['email', 'chat', 'token', 'password', 'participantId', 'labelKey', 'backgroundKey'] as const;

/** True when serialized DTO contains a forbidden PII/secret key. */
export function vrExportContainsForbiddenKeys(dto: VrSceneV1): boolean {
  const encoded = JSON.stringify(dto);
  return VR_EXPORT_FORBIDDEN_KEYS.some((k) => encoded.includes(`"${k}"`));
}

export { SCENE_MAX_BYTES, SCENE_VERSION };
