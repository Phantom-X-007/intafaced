import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { QUEUE_LIST_LIMIT_UNSET, assertOperatorQueueLimit as publishedQueueLimit } from './operator-queue.js';
import { SupportError, assertOperatorQueueLimit } from './support-service.js';
import { userCopy } from './user-copy.js';

/**
 * listQueue page size is refuse-closed when unset.
 *
 * buildOperatorQueue used `options.limit ?? 100` and listQueue passed
 * `input?.limit`, so omit invented a 100-row operator ticket queue. Blank
 * must refuse. Owner/client may pass 100 explicitly.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('listQueue limit unset refuse', () => {
  it('assertOperatorQueueLimit refuses blank / NaN / 0 — never invents 100', () => {
    expect(() => assertOperatorQueueLimit(undefined)).toThrow(SupportError);
    expect(() => assertOperatorQueueLimit(Number.NaN)).toThrow(SupportError);
    expect(() => assertOperatorQueueLimit(0)).toThrow(SupportError);
    try {
      assertOperatorQueueLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(SupportError);
      expect((e as SupportError).code).toBe(QUEUE_LIST_LIMIT_UNSET);
      expect((e as SupportError).message).not.toMatch(/100-row|default 100/i);
      expect(userCopy((e as SupportError).code)).toBe(QUEUE_LIST_LIMIT_UNSET);
      expect(userCopy((e as SupportError).code)).not.toMatch(/100-row|default 100/i);
    }
    expect(() => publishedQueueLimit(undefined)).toThrow(/support\.queue_list_limit_unset/);
  });

  it('accepts owner-published 100 and caps at existing door max 500', () => {
    expect(assertOperatorQueueLimit(100)).toBe(100);
    expect(assertOperatorQueueLimit(1)).toBe(1);
    expect(assertOperatorQueueLimit(500)).toBe(500);
    expect(assertOperatorQueueLimit(501)).toBe(500);
  });

  it('buildOperatorQueue no longer defaults limit to 100', () => {
    const src = readFileSync(join(ROOT, 'services/svc-support/src/operator-queue.ts'), 'utf8');
    const start = src.indexOf('export function buildOperatorQueue(');
    const end = src.indexOf('export function assignNext(', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('assertOperatorQueueLimit');
    expect(fn).not.toMatch(/limit \?\? 100/);
    expect(fn).not.toMatch(/\?\? 100/);
  });

  it('router does not invent 100 when listQueue omits limit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-support/src/router.ts'), 'utf8');
    const start = src.indexOf('listQueue:');
    const end = src.indexOf('next:', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('listOperatorQueue({ limit: input?.limit })');
    expect(fn).not.toMatch(/input\?\.limit \?\? 100/);
    expect(fn).not.toMatch(/\?\? 100/);
  });
});
