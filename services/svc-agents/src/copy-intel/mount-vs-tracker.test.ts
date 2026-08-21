/**
 * Unit card — Copy-Intel mount vs tracker honest gaps
 * 1. Promise: fixture doors are mounted; live trade.copy leader plane stays
 *    refused; tracker `agents.copy-intel` must not read as done.
 * 2. Break: delete a copyIntel door from router.ts, or flip
 *    LIVE_TRADE_COPY_LEADER_PLANE_OPEN without Class X, and green fixture tests
 *    misread as live leader stats shipping.
 * 3. Done bar: mount matrix complete + trackerDoneForbidden while live sealed.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROUTING_TABLE } from '../gateway/routing.js';
import {
  COPY_INTEL_BLOCKER_TRACKER_ID,
  COPY_INTEL_DECLARED_TASK,
  COPY_INTEL_MOUNTED_DOORS,
  COPY_INTEL_TRACKER_ID,
  HONEST_GAPS,
  copyIntelDeclaredTaskMatchesGuardrail,
  copyIntelDoorsInRouterSource,
  copyIntelMountMatrixComplete,
  copyIntelMountVsTrackerBoardCard,
  copyIntelMountVsTrackerExportHeader,
  copyIntelMountVsTrackerExportText,
  copyIntelMountVsTrackerStatusLine,
  copyIntelMountVsTrackerStatusLineMatches,
  isDeclaredHonestGap,
  parseCopyIntelMountVsTrackerStatusLine,
  trackerDoneForbiddenWhileLiveRefuse,
} from './mount-vs-tracker.js';
import { LIVE_TRADE_COPY_LEADER_PLANE_OPEN } from './live-leader-plane-refuse.js';

const here = dirname(fileURLToPath(import.meta.url));
const routerSrc = () => readFileSync(join(here, '..', 'router.ts'), 'utf8');

describe('copy-intel mount vs tracker honest gaps (D26-P1-A5)', () => {
  it('names the tracker, blocker, and every honest gap code', () => {
    expect(COPY_INTEL_TRACKER_ID).toBe('agents.copy-intel');
    expect(COPY_INTEL_BLOCKER_TRACKER_ID).toBe('trade.copy');
    expect(HONEST_GAPS).toContain('gap.class_x_live_leaders');
    expect(HONEST_GAPS).toContain('gap.tracker_not_done_while_live_refuse');
    expect(HONEST_GAPS).toContain('gap.no_live_audited_store');
    expect(HONEST_GAPS).toContain('gap.no_shell_consumer');
    expect(HONEST_GAPS).toContain('gap.no_invent_rank_board');
    for (const gap of HONEST_GAPS) {
      expect(isDeclaredHonestGap(gap)).toBe(true);
    }
    expect(isDeclaredHonestGap('gap.invent_leaderboard')).toBe(false);
  });

  it('forbids tracker done while the live leader plane is sealed', () => {
    expect(LIVE_TRADE_COPY_LEADER_PLANE_OPEN).toBe(false);
    expect(trackerDoneForbiddenWhileLiveRefuse()).toBe(true);
    expect(trackerDoneForbiddenWhileLiveRefuse(false)).toBe(true);
    expect(trackerDoneForbiddenWhileLiveRefuse(true)).toBe(false);
  });

  it('guardrail declares copy_intel.stats and routing table carries the task', () => {
    expect(copyIntelDeclaredTaskMatchesGuardrail()).toBe(true);
    const tasks = DEFAULT_ROUTING_TABLE.routes.map((r) => r.task);
    expect(tasks).toContain(COPY_INTEL_DECLARED_TASK);
  });

  it('board card, status line, and export stay consistent', () => {
    const card = copyIntelMountVsTrackerBoardCard();
    expect(card.tracker).toBe(COPY_INTEL_TRACKER_ID);
    expect(card.blocker).toBe(COPY_INTEL_BLOCKER_TRACKER_ID);
    expect(card.trackerDoneForbidden).toBe(true);
    expect(card.liveOpen).toBe(false);
    expect(card.taskDeclared).toBe(true);
    expect(copyIntelMountVsTrackerStatusLineMatches()).toBe(true);
    expect(parseCopyIntelMountVsTrackerStatusLine('bad')).toBeNull();
    expect(copyIntelMountVsTrackerExportText().startsWith(copyIntelMountVsTrackerExportHeader())).toBe(true);
  });
});

describe('copy-intel public doors are mounted on router.ts', () => {
  it('every declared door is present in the copyIntel namespace', () => {
    const mounted = copyIntelDoorsInRouterSource();
    expect(mounted.sort()).toEqual([...COPY_INTEL_MOUNTED_DOORS].sort());
    expect(copyIntelMountMatrixComplete()).toBe(true);
    expect(copyIntelMountVsTrackerBoardCard().mountComplete).toBe(true);
  });

  it('runSession is scoped agents:execute — fixture buildStats stays agents:read', () => {
    const src = routerSrc();
    const nsStart = src.search(/^\s{4}copyIntel:\s*router\(\{/m);
    expect(nsStart).toBeGreaterThan(-1);
    const next = src.slice(nsStart + 1).search(/^\s{4}[a-zA-Z]+:\s*router\(\{/m);
    const block = next === -1 ? src.slice(nsStart) : src.slice(nsStart, nsStart + 1 + next);
    expect(block).toMatch(/buildStats:\s*scopedProcedure\('agents:read'/);
    expect(block).toMatch(/presentDirectory:\s*scopedProcedure\('agents:read'/);
    expect(block).toMatch(/runSession:\s*scopedProcedure\('agents:execute'/);
  });

  it('runSession wires runCopyIntelStatsSession — mounted, not merely defined', () => {
    expect(routerSrc()).toMatch(/runCopyIntelStatsSession\(/);
  });
});
