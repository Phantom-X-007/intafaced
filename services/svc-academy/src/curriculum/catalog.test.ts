import { describe, expect, it } from 'vitest';
import { CURRICULUM_PATHS, getCurriculumItem, listCurriculum } from './catalog.js';

/**
 * Curriculum catalog — pure, no database.
 *
 * Pins the thin slice: list is non-empty, filters work, content path returns a
 * body, unknown slug is null, and Blueprint paths are the only paths.
 */

describe('curriculum catalog', () => {
  it('lists a non-empty day-one spine', () => {
    const items = listCurriculum();
    expect(items.length).toBeGreaterThanOrEqual(4);
    for (const item of items) {
      expect(item.slug).toMatch(/^[a-z0-9-]+$/);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.summary.length).toBeGreaterThan(0);
      expect(CURRICULUM_PATHS).toContain(item.path);
      // Summaries never carry the body field — list is metadata only.
      expect(item).not.toHaveProperty('body');
    }
  });

  it('filters by Blueprint path', () => {
    const foundations = listCurriculum({ path: 'foundations' });
    expect(foundations.length).toBeGreaterThan(0);
    expect(foundations.every((i) => i.path === 'foundations')).toBe(true);

    const sovereign = listCurriculum({ path: 'sovereign' });
    expect(sovereign.every((i) => i.path === 'sovereign')).toBe(true);
  });

  it('filters by kind', () => {
    const playbooks = listCurriculum({ kind: 'playbook' });
    expect(playbooks.length).toBeGreaterThan(0);
    expect(playbooks.every((i) => i.kind === 'playbook')).toBe(true);
  });

  it('orders items within a path by order ascending', () => {
    const foundations = listCurriculum({ path: 'foundations' });
    const orders = foundations.map((i) => i.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('returns full body for a known slug', () => {
    const item = getCurriculumItem('foundations-risk-first');
    expect(item).not.toBeNull();
    expect(item!.body).toContain('# Risk first');
    expect(item!.kind).toBe('playbook');
    expect(item!.path).toBe('foundations');
  });

  it('returns null for an unknown slug — no invented content', () => {
    expect(getCurriculumItem('does-not-exist')).toBeNull();
  });

  it('covers every Blueprint curriculum path at least once', () => {
    const paths = new Set(listCurriculum().map((i) => i.path));
    for (const path of CURRICULUM_PATHS) {
      expect(paths.has(path)).toBe(true);
    }
  });

  it('spine bodies use platform vocabulary (Identity Blueprint appears; bodies are non-empty)', () => {
    // Doctrine §0.7 brand hygiene is owned by `pnpm scan:brand` (DoD gate) —
    // this assertion only pins that the seed is real content, not empty stubs.
    // Do not list forbidden vendor names here; the brand scanner rejects those
    // strings even inside tests.
    for (const summary of listCurriculum()) {
      const item = getCurriculumItem(summary.slug)!;
      expect(item.body.trim().length).toBeGreaterThan(40);
      expect(item.body.startsWith('#')).toBe(true);
    }
    const risk = getCurriculumItem('foundations-risk-first')!;
    expect(risk.body).toContain('Identity Blueprint');
  });
});
