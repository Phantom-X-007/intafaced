/**
 * Spatial scene contract Stage-1 (§8.3 VR-ready 2D).
 *
 * Spec: docs/ops/trk/academy.spatial.md Stage 1 — versioned scene schema,
 * reject oversized / invalid payloads. Host writes whole scene; attendees read.
 *
 * Scene JSON must stay free of PII/secrets (no chat, no emails, no tokens).
 * Spans never include scene contents (tracing.ts).
 */

import { z } from 'zod';
import { AcademyError } from '../errors.js';

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
