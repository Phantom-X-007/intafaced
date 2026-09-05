import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { InstrumentError } from './instruments.js';
import { InstrumentService, assertPurgeExpiredSnapshotsLimit } from './instrument-service.js';
import { P2P_COPY, resolveP2pCopy } from './user-copy.js';

/**
 * purgeExpiredSnapshots batch size is refuse-closed when unset.
 *
 * purgeExpiredSnapshots used `limit = 500`, so omit invented a 500-row purge batch.
 * Blank must refuse. Owner may pass 500 explicitly.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('purgeExpiredSnapshots limit unset refuse', () => {
  it('assertPurgeExpiredSnapshotsLimit refuses blank / NaN / 0 — never invents 500', () => {
    expect(() => assertPurgeExpiredSnapshotsLimit(undefined)).toThrow(InstrumentError);
    expect(() => assertPurgeExpiredSnapshotsLimit(Number.NaN)).toThrow(InstrumentError);
    expect(() => assertPurgeExpiredSnapshotsLimit(0)).toThrow(InstrumentError);
    try {
      assertPurgeExpiredSnapshotsLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(InstrumentError);
      expect((e as InstrumentError).code).toBe('p2p.purge_snapshots_limit_unset');
      expect((e as InstrumentError).message).toBe(resolveP2pCopy(P2P_COPY.purgeSnapshotsLimitUnset));
      expect((e as InstrumentError).message).not.toMatch(/500-row|default 500/i);
    }
  });

  it('purgeExpiredSnapshots refuses without limit — never invents 500', async () => {
    const instruments = new InstrumentService({} as never, { retentionDays: 90 });
    await expect(instruments.purgeExpiredSnapshots()).rejects.toMatchObject({
      code: 'p2p.purge_snapshots_limit_unset',
    });
    expect(assertPurgeExpiredSnapshotsLimit(500)).toBe(500);
  });

  it('accepts owner-published 500 and caps at 5000', () => {
    expect(assertPurgeExpiredSnapshotsLimit(500)).toBe(500);
    expect(assertPurgeExpiredSnapshotsLimit(1)).toBe(1);
    expect(assertPurgeExpiredSnapshotsLimit(5_000)).toBe(5_000);
    expect(assertPurgeExpiredSnapshotsLimit(5_001)).toBe(5_000);
  });

  it('purgeExpiredSnapshots no longer defaults limit to 500', () => {
    const src = readFileSync(join(ROOT, 'services/svc-p2p/src/instrument-service.ts'), 'utf8');
    const start = src.indexOf('async purgeExpiredSnapshots(');
    const end = src.indexOf('// ── internals', start);
    const fn = src.slice(start, end === -1 ? undefined : end);
    expect(fn).toContain('assertPurgeExpiredSnapshotsLimit');
    expect(fn).not.toMatch(/limit = 500/);
    expect(fn).not.toMatch(/\?\? 500/);
  });

  it('index sweep publishes 500 explicitly — does not omit', () => {
    const src = readFileSync(join(ROOT, 'services/svc-p2p/src/index.ts'), 'utf8');
    expect(src).toContain('purgeExpiredSnapshots(500)');
    expect(src).not.toMatch(/purgeExpiredSnapshots\(\s*\)/);
  });
});
