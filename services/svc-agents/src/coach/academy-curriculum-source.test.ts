import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EmptyAcademyCurriculumSource,
  FixedAcademyCurriculumSource,
  createAcademyCurriculumSource,
  parseAcademyCurriculumPayload,
} from './academy-curriculum-source.js';

const SECRET = 'an-agents-curriculum-source-test-secret-32';
const SPINE = [{ slug: 'foundations-risk-first', title: 'Risk first' }];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseAcademyCurriculumPayload — never invent titles', () => {
  it('reads slug+title from an items envelope', () => {
    expect(parseAcademyCurriculumPayload({ items: SPINE })).toEqual({
      items: SPINE,
      licensedLibraryImported: false,
    });
  });

  it('reads a raw summary array (academy catalog shape)', () => {
    expect(parseAcademyCurriculumPayload([{ slug: 'foundations-risk-first', title: 'Risk first', kind: 'playbook' }])).toEqual({
      items: SPINE,
      licensedLibraryImported: false,
    });
  });

  it('drops rows missing slug or title rather than filling them in', () => {
    expect(parseAcademyCurriculumPayload({ items: [{ slug: 'x' }, { title: 'Y' }, SPINE[0]] })).toEqual({
      items: SPINE,
      licensedLibraryImported: false,
    });
  });

  it('empty items stay empty — chatbot refuse, not a guessed library', () => {
    expect(parseAcademyCurriculumPayload({ items: [] })).toEqual({ items: [], licensedLibraryImported: false });
  });

  it('unreadable payload is empty, and licensed dump is never claimed from the wire', () => {
    expect(parseAcademyCurriculumPayload({ licensedLibraryImported: true, catalog: SPINE })).toEqual({
      items: [],
      licensedLibraryImported: false,
    });
  });
});

describe('Fixed / Empty sources', () => {
  it('EmptyAcademyCurriculumSource is an empty catalog', async () => {
    expect(await new EmptyAcademyCurriculumSource().load()).toEqual({ items: [], licensedLibraryImported: false });
  });

  it('FixedAcademyCurriculumSource returns injected spine with licensed false', async () => {
    expect(await new FixedAcademyCurriculumSource(SPINE).load()).toEqual({
      items: SPINE,
      licensedLibraryImported: false,
    });
  });
});

describe('createAcademyCurriculumSource — fail closed', () => {
  it('GETs /internal/curriculum with service credentials', async () => {
    let seenUrl = '';
    let seen: Record<string, string> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        seenUrl = url;
        seen = init.headers as Record<string, string>;
        return new Response(JSON.stringify({ items: SPINE }), { status: 200 });
      }),
    );

    const grounding = await createAcademyCurriculumSource('http://svc-academy:4016/', SECRET).load();
    expect(seenUrl).toBe('http://svc-academy:4016/internal/curriculum');
    expect(Object.keys(seen).some((k) => k.toLowerCase().includes('service'))).toBe(true);
    expect(grounding.items).toEqual(SPINE);
    expect(grounding.licensedLibraryImported).toBe(false);
  });

  it('401 (unsigned / forbidden) is empty catalog, not invented titles', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unauthorized', { status: 401 })),
    );
    const grounding = await createAcademyCurriculumSource('http://svc-academy:4016', SECRET).load();
    expect(grounding).toEqual({ items: [], licensedLibraryImported: false });
  });

  it('empty academy catalog stays empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 })),
    );
    const grounding = await createAcademyCurriculumSource('http://svc-academy:4016', SECRET).load();
    expect(grounding.items).toEqual([]);
  });

  it('transport failure is empty catalog', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    const grounding = await createAcademyCurriculumSource('http://svc-academy:4016', SECRET).load();
    expect(grounding).toEqual({ items: [], licensedLibraryImported: false });
  });
});
