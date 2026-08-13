/**
 * Spatial scene contract Stage-1 (§8.3 VR-ready 2D).
 *
 * Spec: docs/ops/trk/academy.spatial.md Stage 1 — versioned scene schema,
 * reject oversized / invalid payloads. Host writes whole scene; attendees read.
 *
 * Concurrent host writes: see `edit-policy.ts` (`decideHostSceneWrite`) —
 * re-exported here so updateScene callers import one spatial surface.
 *
 * Scene JSON must stay free of PII/secrets (no chat, no emails, no tokens).
 * Spans never include scene contents (tracing.ts).
 */

import { z } from 'zod';
import { AcademyError } from '../errors.js';

export {
  decideHostSceneWrite,
  isHostSceneWriteConflict,
  isHostSceneWriteOk,
  sceneFingerprint,
  sceneRequiresHostFingerprint,
  type HostSceneWriteInput,
  type HostSceneWriteResult,
} from './edit-policy.js';

/** Max UTF-8 bytes of JSON.stringify(scene). Oversized rooms DoS the host UI. */
export const SCENE_MAX_BYTES = 64 * 1024;

/** Current contract version. Bump when keys are removed or semantics change. */
export const SCENE_VERSION = 1 as const;

const vec2 = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

const avatar = z.object({
  id: z.string().min(1).max(64),
  /** Opaque participant key — prefer session seat id, never email. */
  participantId: z.string().min(1).max(64),
  position: vec2,
  facing: z.number().finite().optional(),
  labelKey: z.string().max(120).optional(),
});

const stage = z.object({
  width: z.number().finite().positive().max(10_000),
  height: z.number().finite().positive().max(10_000),
  backgroundKey: z.string().max(120).optional(),
});

/**
 * Scene v1 — closed set of keys. Unknown top-level keys are rejected so the
 * shell cannot smuggle free-form PII under "extras".
 */
export const sceneV1Schema = z
  .object({
    version: z.literal(SCENE_VERSION),
    stage: stage.optional(),
    avatars: z.array(avatar).max(200).optional(),
    /** Opaque prop placements; values are numbers/strings only, no nested free maps. */
    props: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          kind: z.string().min(1).max(64),
          position: vec2,
          rotation: z.number().finite().optional(),
        }),
      )
      .max(500)
      .optional(),
  })
  .strict();

export type SceneV1 = z.infer<typeof sceneV1Schema>;

export type ParseSceneOk = { ok: true; scene: SceneV1 };
export type ParseSceneErr = { ok: false; reason: 'invalid' | 'oversized'; message: string };
export type ParseSceneResult = ParseSceneOk | ParseSceneErr;

/**
 * Validate an unknown payload as Scene v1.
 * Empty object `{}` is invalid — clients must send `version: 1` (or use default empty scene from DB).
 */
export function parseScene(input: unknown): ParseSceneResult {
  let encoded: string;
  try {
    encoded = JSON.stringify(input ?? null);
  } catch {
    return { ok: false, reason: 'invalid', message: 'scene is not JSON-serializable' };
  }
  if (encoded === undefined) {
    return { ok: false, reason: 'invalid', message: 'scene is not JSON-serializable' };
  }
  const bytes = Buffer.byteLength(encoded, 'utf8');
  if (bytes > SCENE_MAX_BYTES) {
    return {
      ok: false,
      reason: 'oversized',
      message: `scene exceeds ${SCENE_MAX_BYTES} bytes (got ${bytes})`,
    };
  }

  const parsed = sceneV1Schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid',
      message: parsed.error.issues.map((i) => i.message).join('; ') || 'scene failed schema',
    };
  }
  return { ok: true, scene: parsed.data };
}

/** Throw AcademyError on bad scene — for service/router use. */
export function assertScene(input: unknown): SceneV1 {
  const r = parseScene(input);
  if (!r.ok) {
    throw new AcademyError(r.message, 'academy.scene_invalid');
  }
  return r.scene;
}

/** Default empty scene for new sessions (valid v1). */
export function emptyScene(): SceneV1 {
  return { version: SCENE_VERSION };
}

/** L3 — UTF-8 byte size of a scene payload. Invalid JSON → 0. */
export function sceneByteSize(input: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(input ?? null), 'utf8');
  } catch {
    return 0;
  }
}

/** L3 — true when payload is under SCENE_MAX_BYTES. */
export function sceneWithinSizeBudget(input: unknown): boolean {
  const n = sceneByteSize(input);
  return n > 0 && n <= SCENE_MAX_BYTES;
}

/** L3 — avatar count (missing → 0, no invent). */
export function sceneAvatarCount(scene: SceneV1): number {
  return scene.avatars?.length ?? 0;
}

/** L3 — prop count (missing → 0). */
export function scenePropCount(scene: SceneV1): number {
  return scene.props?.length ?? 0;
}

/** L3 — scene board card for operator honesty. */
export function sceneBoardCard(scene: SceneV1): {
  readonly version: number;
  readonly avatars: number;
  readonly props: number;
  readonly hasStage: boolean;
  readonly bytes: number;
  readonly withinBudget: boolean;
} {
  const bytes = sceneByteSize(scene);
  return {
    version: scene.version,
    avatars: sceneAvatarCount(scene),
    props: scenePropCount(scene),
    hasStage: scene.stage != null,
    bytes,
    withinBudget: bytes > 0 && bytes <= SCENE_MAX_BYTES,
  };
}

/** L3 — scene status line. */
export function sceneStatusLine(scene: SceneV1): string {
  const c = sceneBoardCard(scene);
  return `v=${c.version} avatars=${c.avatars} props=${c.props} bytes=${c.bytes}`;
}

/** L3 — true when empty default (no avatars/props). */
export function sceneStatusLineIsEmpty(scene: SceneV1): boolean {
  return sceneAvatarCount(scene) === 0 && scenePropCount(scene) === 0;
}

/** L3 — detailed scene status. */
export function sceneStatusLineDetailed(scene: SceneV1): string {
  const c = sceneBoardCard(scene);
  return `v=${c.version} avatars=${c.avatars} props=${c.props} bytes=${c.bytes} stage=${c.hasStage ? '1' : '0'} ok=${c.withinBudget ? '1' : '0'}`;
}

/** L3 — parse scene status. Invalid → null. */
export function parseSceneStatusLine(
  line: string,
): { readonly version: number; readonly avatars: number; readonly props: number; readonly bytes: number } | null {
  const m = line.trim().match(/^v=(\d+) avatars=(\d+) props=(\d+) bytes=(\d+)$/);
  if (!m) return null;
  return { version: Number(m[1]), avatars: Number(m[2]), props: Number(m[3]), bytes: Number(m[4]) };
}

/** L3 — true when status matches scene. */
export function sceneStatusLineMatches(scene: SceneV1): boolean {
  const p = parseSceneStatusLine(sceneStatusLine(scene));
  if (!p) return false;
  const c = sceneBoardCard(scene);
  return p.version === c.version && p.avatars === c.avatars && p.props === c.props && p.bytes === c.bytes;
}

/** L3 — export header. */
export function sceneExportHeader(): string {
  return 'version,avatars,props,bytes,hasStage';
}

/** L3 — export line. */
export function sceneExportLine(scene: SceneV1): string {
  const c = sceneBoardCard(scene);
  return `${c.version},${c.avatars},${c.props},${c.bytes},${c.hasStage ? '1' : '0'}`;
}

/** L3 — full export text. */
export function sceneExportText(scene: SceneV1): string {
  return [sceneExportHeader(), sceneExportLine(scene)].join('\n');
}

/** L3 — true when avatar count is within [min,max]. Invalid → false. */
export function sceneAvatarCountInRange(scene: SceneV1, min: number, max: number): boolean {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return false;
  const n = sceneAvatarCount(scene);
  return n >= min && n <= max;
}

/** L3 — true when byte size is at most n. */
export function sceneBytesAtMost(scene: SceneV1, n: number): boolean {
  if (!Number.isFinite(n)) return false;
  return sceneByteSize(scene) <= n;
}
