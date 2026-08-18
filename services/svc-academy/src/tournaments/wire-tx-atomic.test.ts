/**
 * W9 L07 — wire TX atomic seals for tournament bulk scores + freeze.
 *
 * Reachable breaks without a single TX:
 * 1. bulkSetStandings looping setStanding → mid-batch freeze/crash leaves a
 *    partial board (some patches durable, rest refused).
 * 2. freeze snapshot INSERT then status UPDATE → crash between them leaves a
 *    durable snapshot while status stays live (scores still write; later freeze
 *    ON CONFLICT DO NOTHING keeps the stale snapshot).
 *
 * Pure source seals — academy has no per-service Postgres harness. Same class
 * as paper/ambassador ledger isolation scans.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const serviceSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../academy-service.ts'), 'utf8');

/**
 * Extract `async name(...) { … }` body, skipping `{` inside the param list and
 * return-type (Promise<{…}> etc.).
 */
function methodBody(name: string): string {
  const needle = `async ${name}(`;
  const start = serviceSrc.indexOf(needle);
  if (start < 0) throw new Error(`method ${name} not found in academy-service.ts`);

  // 1) Close the parameter list — track () {} <> depth so nested types don't
  //    end the scan early.
  let i = start + needle.length - 1; // at '('
  let paren = 0;
  let brace = 0;
  let angle = 0;
  for (; i < serviceSrc.length; i++) {
    const c = serviceSrc[i]!;
    if (c === '(') paren += 1;
    else if (c === ')') {
      paren -= 1;
      if (paren === 0 && brace === 0 && angle === 0) break;
    } else if (c === '{') brace += 1;
    else if (c === '}') brace -= 1;
    else if (c === '<') angle += 1;
    else if (c === '>') angle = Math.max(0, angle - 1);
  }
  if (i >= serviceSrc.length) throw new Error(`method ${name}: param list not closed`);

  // 2) Optional `: ReturnType` then body `{`.
  let j = i + 1;
  while (j < serviceSrc.length && /\s/.test(serviceSrc[j]!)) j += 1;
  if (serviceSrc[j] === ':') {
    j += 1;
    let rBrace = 0;
    let rAngle = 0;
    let rParen = 0;
    for (; j < serviceSrc.length; j++) {
      const c = serviceSrc[j]!;
      if (c === '{') {
        if (rBrace === 0 && rAngle === 0 && rParen === 0) break; // method body
        rBrace += 1;
      } else if (c === '}') rBrace -= 1;
      else if (c === '<') rAngle += 1;
      else if (c === '>') rAngle = Math.max(0, rAngle - 1);
      else if (c === '(') rParen += 1;
      else if (c === ')') rParen -= 1;
    }
  } else {
    while (j < serviceSrc.length && serviceSrc[j] !== '{') j += 1;
  }
  if (serviceSrc[j] !== '{') throw new Error(`method ${name}: body { not found`);

  let depth = 0;
  for (let b = j; b < serviceSrc.length; b++) {
    if (serviceSrc[b] === '{') depth += 1;
    else if (serviceSrc[b] === '}') {
      depth -= 1;
      if (depth === 0) return serviceSrc.slice(j, b + 1);
    }
  }
  throw new Error(`method ${name}: unclosed body`);
}

describe('tournament wire TX atomic seals (W9 residual)', () => {
  it('bulkSetStandings upserts under one transaction + season FOR UPDATE (no setStanding loop)', () => {
    const body = methodBody('bulkSetStandings');
    expect(body, 'bulk writes must run inside transaction()').toMatch(/\btransaction\s*\(/);
    expect(body, 'season row must be locked before multi-row upsert').toMatch(/FOR UPDATE/);
    expect(body, 're-gate under the lock so freeze cannot interleave').toMatch(/validateBulkScoreWrite/);
    expect(body, 'upserts must be in-tx, not delegated to outer setStanding').not.toMatch(/await this\.setStanding\s*\(/);
    expect(body).toMatch(/INSERT INTO academy\.tournament_standings/);
  });

  it('live→frozen freezes snapshot + status flip in one transaction under FOR UPDATE', () => {
    const body = methodBody('setSeasonStatus');
    expect(body, 'freeze path must use transaction()').toMatch(/\btransaction\s*\(/);
    expect(body, 'season must be locked for freeze').toMatch(/FOR UPDATE/);
    expect(body).toMatch(/tournament_freeze_snapshots/);
    // Status flip is active-only under the same tx so concurrent freeze cannot
    // race a second writer past the snapshot.
    expect(body).toMatch(/SET status = 'frozen'/);
    expect(body).toMatch(/AND status = 'live'/);
    // Snapshot insert and status update both appear inside the method; the
    // transaction( wrapper guarantees they share a commit boundary.
    const txIdx = body.indexOf('transaction(');
    const snapIdx = body.indexOf('tournament_freeze_snapshots');
    const statusIdx = body.indexOf("SET status = 'frozen'");
    expect(txIdx).toBeGreaterThanOrEqual(0);
    expect(snapIdx).toBeGreaterThan(txIdx);
    expect(statusIdx).toBeGreaterThan(snapIdx);
  });
});
