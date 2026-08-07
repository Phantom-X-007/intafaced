import { describe, expect, it } from 'vitest';
import {
  CURRICULUM_DEFAULT_LOCALE,
  curriculumBodyForLocale,
  curriculumI18nStrategyHonest,
  curriculumI18nStrategyLine,
  resolveCurriculumLocale,
} from './i18n-strategy.js';

describe('curriculum i18n strategy — Stage-3', () => {
  it('defaults empty/unknown locales to en with fellBack', () => {
    expect(resolveCurriculumLocale(undefined)).toEqual({
      requested: null,
      locale: CURRICULUM_DEFAULT_LOCALE,
      fellBack: true,
    });
    expect(resolveCurriculumLocale('fr')).toEqual({
      requested: 'fr',
      locale: CURRICULUM_DEFAULT_LOCALE,
      fellBack: true,
    });
    expect(resolveCurriculumLocale('!!')).toMatchObject({ fellBack: true, locale: 'en' });
  });

  it('accepts en without fallback and never invents a translated body', () => {
    expect(resolveCurriculumLocale('en')).toEqual({
      requested: 'en',
      locale: 'en',
      fellBack: false,
    });
    const body = '# Risk first\n\nSize from risk.';
    const fr = curriculumBodyForLocale(body, 'fr');
    expect(fr.body).toBe(body);
    expect(fr.resolution.fellBack).toBe(true);
    const en = curriculumBodyForLocale(body, 'en');
    expect(en.body).toBe(body);
    expect(en.resolution.fellBack).toBe(false);
  });

  it('strategy line is honest about never inventing translations', () => {
    expect(curriculumI18nStrategyLine()).toContain('neverInvent=1');
    expect(curriculumI18nStrategyHonest()).toBe(true);
  });
});
