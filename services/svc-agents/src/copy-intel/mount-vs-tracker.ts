/**
 * D26-P1-A5 — Copy-Intel mount vs tracker honest gaps.
 *
 * Tracker `agents.copy-intel`: fixture audited stats + directory presentation
 * are IN on tip. Live trade.copy leader plane is Class X residual (Shehzad M4).
 *
 * This module is the machine-checkable split so green fixture mount tests
 * cannot be misread as "live copy leader stats ship" or tracker done.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyIntelAgentGuardrail } from './guardrail.js';
import { liveTradeCopyLeaderPlaneOpen } from './live-leader-plane-refuse.js';

/** Tracker id for Copy-Intel — audited leader stats mountain. */
export const COPY_INTEL_TRACKER_ID = 'agents.copy-intel' as const;

/** Blocker tracker id — human-owned M4. Agents babysit only. */
export const COPY_INTEL_BLOCKER_TRACKER_ID = 'trade.copy' as const;

/** Public doors mounted on the `copyIntel` router namespace. */
export const COPY_INTEL_MOUNTED_DOORS = ['buildStats', 'presentDirectory', 'runSession'] as const;

export type CopyIntelMountedDoor = (typeof COPY_INTEL_MOUNTED_DOORS)[number];

/** Declared routing/guardrail task — fixture path only until live plane opens. */
export const COPY_INTEL_DECLARED_TASK = 'copy_intel.stats' as const;

/** Named honest gaps — codes, not marketing copy. */
export const HONEST_GAPS = [
  'gap.class_x_live_leaders',
  'gap.tracker_not_done_while_live_refuse',
  'gap.no_live_audited_store',
  'gap.no_shell_consumer',
  'gap.no_invent_rank_board',
] as const;

export type HonestGapId = (typeof HONEST_GAPS)[number];

export function isDeclaredHonestGap(id: string): id is HonestGapId {
  return (HONEST_GAPS as readonly string[]).includes(id);
}

/**
 * Tracker Done bar honesty: fixture mount may be `ready` while live leaders
 * stay refused. Flipping the tracker to `done` while the live plane is still
 * sealed is forbidden (TRK pack + TRACKER row).
 */
export function trackerDoneForbiddenWhileLiveRefuse(liveLeaderPlaneOpen: boolean = liveTradeCopyLeaderPlaneOpen()): boolean {
  return !liveLeaderPlaneOpen;
}

export function copyIntelDeclaredTaskMatchesGuardrail(): boolean {
  const tasks = copyIntelAgentGuardrail().limits.allowedTasks;
  return tasks.length === 1 && tasks[0] === COPY_INTEL_DECLARED_TASK;
}

/** Parse router.ts for mounted copyIntel doors (read-only — no import of router). */
export function copyIntelDoorsInRouterSource(): readonly CopyIntelMountedDoor[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const routerPath = join(here, '..', 'router.ts');
  const src = readFileSync(routerPath, 'utf8');
  const start = src.search(/^\s{4}copyIntel:\s*router\(\{/m);
  if (start === -1) return [];
  const next = src.slice(start + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
  const block = next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
  return COPY_INTEL_MOUNTED_DOORS.filter((door) => new RegExp(`\\b${door}\\s*:`).test(block));
}

/** True when every declared door appears in router.ts. */
export function copyIntelMountMatrixComplete(): boolean {
  const mounted = copyIntelDoorsInRouterSource();
  return mounted.length === COPY_INTEL_MOUNTED_DOORS.length;
}

export function copyIntelMountVsTrackerBoardCard(): {
  readonly tracker: typeof COPY_INTEL_TRACKER_ID;
  readonly blocker: typeof COPY_INTEL_BLOCKER_TRACKER_ID;
  readonly doors: number;
  readonly doorsMounted: number;
  readonly gaps: number;
  readonly liveOpen: boolean;
  readonly trackerDoneForbidden: boolean;
  readonly taskDeclared: boolean;
  readonly mountComplete: boolean;
} {
  const mounted = copyIntelDoorsInRouterSource();
  return {
    tracker: COPY_INTEL_TRACKER_ID,
    blocker: COPY_INTEL_BLOCKER_TRACKER_ID,
    doors: COPY_INTEL_MOUNTED_DOORS.length,
    doorsMounted: mounted.length,
    gaps: HONEST_GAPS.length,
    liveOpen: liveTradeCopyLeaderPlaneOpen(),
    trackerDoneForbidden: trackerDoneForbiddenWhileLiveRefuse(),
    taskDeclared: copyIntelDeclaredTaskMatchesGuardrail(),
    mountComplete: mounted.length === COPY_INTEL_MOUNTED_DOORS.length,
  };
}

export function copyIntelMountVsTrackerStatusLine(): string {
  const c = copyIntelMountVsTrackerBoardCard();
  return (
    `tracker=${c.tracker} blocker=${c.blocker} doors=${c.doorsMounted}/${c.doors} ` +
    `gaps=${c.gaps} liveOpen=${c.liveOpen ? '1' : '0'} ` +
    `trackerDoneForbidden=${c.trackerDoneForbidden ? '1' : '0'} mount=${c.mountComplete ? '1' : '0'}`
  );
}

export function parseCopyIntelMountVsTrackerStatusLine(line: string): {
  readonly tracker: string;
  readonly blocker: string;
  readonly doorsMounted: number;
  readonly doors: number;
  readonly gaps: number;
  readonly liveOpen: boolean;
  readonly trackerDoneForbidden: boolean;
  readonly mountComplete: boolean;
} | null {
  const m = line
    .trim()
    .match(/^tracker=(\S+) blocker=(\S+) doors=(\d+)\/(\d+) gaps=(\d+) liveOpen=([01]) trackerDoneForbidden=([01]) mount=([01])$/);
  if (!m) return null;
  return {
    tracker: m[1]!,
    blocker: m[2]!,
    doorsMounted: Number(m[3]),
    doors: Number(m[4]),
    gaps: Number(m[5]),
    liveOpen: m[6] === '1',
    trackerDoneForbidden: m[7] === '1',
    mountComplete: m[8] === '1',
  };
}

export function copyIntelMountVsTrackerStatusLineMatches(): boolean {
  const p = parseCopyIntelMountVsTrackerStatusLine(copyIntelMountVsTrackerStatusLine());
  if (!p) return false;
  const c = copyIntelMountVsTrackerBoardCard();
  return (
    p.tracker === c.tracker &&
    p.blocker === c.blocker &&
    p.doorsMounted === c.doorsMounted &&
    p.doors === c.doors &&
    p.gaps === c.gaps &&
    p.liveOpen === c.liveOpen &&
    p.trackerDoneForbidden === c.trackerDoneForbidden &&
    p.mountComplete === c.mountComplete
  );
}

export function copyIntelMountVsTrackerExportHeader(): string {
  return 'door,mounted';
}

export function copyIntelMountVsTrackerExportLines(): readonly string[] {
  const mounted = new Set(copyIntelDoorsInRouterSource());
  return COPY_INTEL_MOUNTED_DOORS.map((door) => `${door},${mounted.has(door) ? '1' : '0'}`);
}

export function copyIntelMountVsTrackerExportText(): string {
  return [copyIntelMountVsTrackerExportHeader(), ...copyIntelMountVsTrackerExportLines()].join('\n');
}
