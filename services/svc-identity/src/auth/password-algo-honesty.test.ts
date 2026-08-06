import { describe, expect, it } from 'vitest';
import {
  passwordAlgoCatalogBoardCard,
  passwordAlgoCatalogStatusLine,
  parsePasswordAlgoCatalogStatusLine,
  passwordAlgoCatalogStatusLineMatches,
  passwordAlgoCatalogStatusLineConsistent,
  passwordAlgoCatalogExportHeader,
  passwordAlgoCatalogExportLine,
  passwordAlgoCatalogExportText,
  isDeclaredPasswordAlgorithm,
  isProdRequiredPasswordAlgorithm,
  HASH_ALGO_CATALOG,
  HASH_ALGO_PROD_REQUIRED,
} from './password-algo-honesty.js';

describe('L3 wave86 password algo catalog honesty', () => {
  it('catalog boards', () => {
    expect(HASH_ALGO_CATALOG).toEqual(['argon2id', 'scrypt']);
    expect(HASH_ALGO_PROD_REQUIRED).toBe('argon2id');
    expect(passwordAlgoCatalogBoardCard()).toEqual({
      algorithms: 2,
      prodRequired: 'argon2id',
      devFallback: 'scrypt',
      fastHashAllowed: 0,
    });
    expect(passwordAlgoCatalogStatusLine()).toBe('algorithms=2 prod=argon2id dev_fallback=scrypt fast_hash=0');
    expect(passwordAlgoCatalogStatusLineMatches()).toBe(true);
    expect(passwordAlgoCatalogStatusLineConsistent(passwordAlgoCatalogStatusLine())).toBe(true);
    expect(passwordAlgoCatalogExportText().startsWith(passwordAlgoCatalogExportHeader())).toBe(true);
    expect(passwordAlgoCatalogExportLine()).toBe('2,argon2id,scrypt,0');
    expect(isDeclaredPasswordAlgorithm('scrypt')).toBe(true);
    expect(isDeclaredPasswordAlgorithm('bcrypt')).toBe(false);
    expect(isProdRequiredPasswordAlgorithm('argon2id')).toBe(true);
    expect(isProdRequiredPasswordAlgorithm('scrypt')).toBe(false);
    expect(parsePasswordAlgoCatalogStatusLine('nope')).toBeNull();
  });
});
