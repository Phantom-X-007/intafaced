/**
 * Concurrent host scene-edit policy (TRK-academy.spatial residual).
 *
 * Spec residual: "Concurrent scene edit policy" — hosts write the whole scene;
 * attendees read. Without a conflict model, two host tabs last-write-wins and
 * seats/presence can desync. This module is the pure decide() for that write.
 *
 * D26-P1-C6 (backend scene integrity): after the server scene is non-empty,
 * `expectedFingerprint` is required — omit is refused **by name**
 * (`fingerprint_required`), not silent last-write. Stale token is
 * `fingerprint_mismatch`. Both keep `reason: 'conflict'` so existing
 * `updateScene` maps to `academy.scene_conflict` without a router/service edit.
 * First write onto empty v1 may still omit. No FE polish here.
 *
 * Consumer path: `scene.ts` re-exports for `assertScene` / updateScene callers.
 * No SFU, no money, no PII in fingerprints (ids + geometry only).
 */

import { createHash } from 'node:crypto';
import { parseScene, type SceneV1 } from './scene.js';

export type HostSceneWriteReason = 'invalid' | 'oversized' | 'conflict' | 'presence_collision';

/** Named concurrency refuses — tests fail if omit clobbers without a fingerprint. */
export type HostSceneWriteRefuseName = 'fingerprint_mismatch' | 'fingerprint_required';

export const HOST_SCENE_REFUSE = {
  fingerprint_mismatch: 'fingerprint_mismatch',
  fingerprint_required: 'fingerprint_required',
} as const satisfies Record<HostSceneWriteRefuseName, HostSceneWriteRefuseName>;

export type HostSceneWriteOk = {
  readonly ok: true;
  readonly scene: SceneV1;
  readonly fingerprint: string;
};

export type HostSceneWriteConflictErr = {
  readonly ok: false;
  readonly reason: 'conflict';
  readonly name: HostSceneWriteRefuseName;
  readonly message: string;
};

export type HostSceneWriteSchemaErr = {
  readonly ok: false;
  readonly reason: Exclude<HostSceneWriteReason, 'conflict'>;
  readonly message: string;
};

export type HostSceneWriteErr = HostSceneWriteConflictErr | HostSceneWriteSchemaErr;

export type HostSceneWriteResult = HostSceneWriteOk | HostSceneWriteErr;

export type HostSceneWriteInput = {
  /** Durable server scene before this write. */
  readonly current: SceneV1;
  /** Proposed whole-scene replacement from the host. */
  readonly next: unknown;
  /**
   * Optimistic concurrency token. Required when `current` is non-empty
   * (`sceneRequiresHostFingerprint`). When set, must equal
   * `sceneFingerprint(current)` or the write is refused (stale host tab).
   * Omit / blank only for the first authoritative write onto an empty v1 scene.
   */
  readonly expectedFingerprint?: string;
};

/**
 * Stable fingerprint of a validated Scene v1.
 * Hash over canonical JSON — never log the scene body in spans; hash only.
 */
export function sceneFingerprint(scene: SceneV1): string {
  const body = JSON.stringify(scene);
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

/**
 * True when the durable server scene has authoring content (stage / avatars /
 * props). Empty `{ version: 1 }` does not require a fingerprint on the next
 * host write; once content exists, omit is a concurrent-edit honesty hole.
 */
export function sceneRequiresHostFingerprint(scene: SceneV1): boolean {
  return scene.stage != null || (scene.avatars?.length ?? 0) > 0 || (scene.props?.length ?? 0) > 0;
}

/** True when the caller supplied a usable optimistic token (not omit / whitespace). */
export function hasExpectedFingerprint(token: string | undefined): token is string {
  return typeof token === 'string' && token.trim().length > 0;
}

function conflictRefuse(name: HostSceneWriteRefuseName, message: string): HostSceneWriteConflictErr {
  return { ok: false, reason: 'conflict', name, message };
}

function presenceCollision(scene: SceneV1): string | null {
  const avatars = scene.avatars ?? [];
  const ids = new Set<string>();
  const participants = new Set<string>();
  for (const a of avatars) {
    if (ids.has(a.id)) {
      return `duplicate avatar id ${a.id}`;
    }
    ids.add(a.id);
    if (participants.has(a.participantId)) {
      return `duplicate participantId ${a.participantId}`;
    }
    participants.add(a.participantId);
  }
  const props = scene.props ?? [];
  const propIds = new Set<string>();
  for (const p of props) {
    if (propIds.has(p.id)) {
      return `duplicate prop id ${p.id}`;
    }
    propIds.add(p.id);
  }
  return null;
}

/**
 * Decide whether a host whole-scene write may commit.
 *
 * Order: require-fp on non-empty → optimistic match → schema/size → presence.
 * Never invent a merge of two host drafts.
 */
export function decideHostSceneWrite(input: HostSceneWriteInput): HostSceneWriteResult {
  const token = hasExpectedFingerprint(input.expectedFingerprint) ? input.expectedFingerprint.trim() : undefined;

  if (sceneRequiresHostFingerprint(input.current) && token === undefined) {
    return conflictRefuse(HOST_SCENE_REFUSE.fingerprint_required, 'scene fingerprint required after non-empty scene — reload and retry');
  }

  if (token !== undefined) {
    const currentFp = sceneFingerprint(input.current);
    if (token !== currentFp) {
      return conflictRefuse(
        HOST_SCENE_REFUSE.fingerprint_mismatch,
        'scene fingerprint mismatch — reload and retry (concurrent host write)',
      );
    }
  }

  const parsed = parseScene(input.next);
  if (!parsed.ok) {
    return {
      ok: false,
      reason: parsed.reason,
      message: parsed.message,
    };
  }

  const collision = presenceCollision(parsed.scene);
  if (collision) {
    return {
      ok: false,
      reason: 'presence_collision',
      message: collision,
    };
  }

  return {
    ok: true,
    scene: parsed.scene,
    fingerprint: sceneFingerprint(parsed.scene),
  };
}

/** True when the write was accepted. */
export function isHostSceneWriteOk(result: HostSceneWriteResult): result is HostSceneWriteOk {
  return result.ok;
}

/** True when refused for concurrency (not schema). */
export function isHostSceneWriteConflict(result: HostSceneWriteResult): result is HostSceneWriteConflictErr {
  return !result.ok && result.reason === 'conflict';
}

/** Named refuse for conflict results; null when accepted or schema/presence. */
export function hostSceneWriteRefuseName(result: HostSceneWriteResult): HostSceneWriteRefuseName | null {
  return isHostSceneWriteConflict(result) ? result.name : null;
}
