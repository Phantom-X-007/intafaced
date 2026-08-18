import { describe, expect, it } from 'vitest';
import {
  FLEET_PRODUCT_AGENTS,
  expectedRunSessionNamespaces,
  fleetMatrixBoardCard,
  routingTasksWithoutFactory,
  runSessionMountsInRouterSource,
  tasksMissingFromRouting,
} from './matrix.js';

describe('fleet mount matrix', () => {
  it('lists five Stage-1 product agents with unique ids', () => {
    expect(FLEET_PRODUCT_AGENTS.map((a) => a.agentId).sort()).toEqual(['copy-intel', 'merchant', 'navigator', 'scanner', 'support'].sort());
    const ids = FLEET_PRODUCT_AGENTS.map((a) => a.agentId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each factory agentId matches its matrix row', () => {
    for (const row of FLEET_PRODUCT_AGENTS) {
      expect(row.factory().agentId).toBe(row.agentId);
    }
  });

  it('every product allowed task has a default routing row (no orphan completions)', () => {
    expect(tasksMissingFromRouting()).toEqual([]);
  });

  it('every product-shaped routing task is claimed by a factory', () => {
    expect(routingTasksWithoutFactory()).toEqual([]);
  });

  it('router runSession mounts match the matrix claim for all five product agents', () => {
    const mounted = runSessionMountsInRouterSource();
    for (const ns of expectedRunSessionNamespaces()) {
      expect(mounted).toContain(ns);
    }
    expect(mounted).toEqual(['copyIntel', 'merchant', 'navigator', 'scanner', 'support'].sort());
  });

  it('boot registers every product agent (no silent 404 on openSession)', () => {
    expect(FLEET_PRODUCT_AGENTS.every((a) => a.bootRegistered === true)).toBe(true);
    expect(fleetMatrixBoardCard().bootRegistered).toBe(5);
  });

  it('board card is reconstructable', () => {
    const card = fleetMatrixBoardCard();
    expect(card.agents).toBe(5);
    expect(card.withRunSession).toBe(5);
    expect(card.bootRegistered).toBe(5);
    expect(card.tasksMissingRoute).toBe(0);
  });

  it('every product agent declares at least one read tool or zero tools with a task', () => {
    for (const row of FLEET_PRODUCT_AGENTS) {
      const g = row.factory();
      expect(g.limits.allowedTasks.length).toBeGreaterThan(0);
      // Tools may be empty in theory; Stage-1 all declare at least one.
      expect(g.tools.length).toBeGreaterThan(0);
    }
  });
});
