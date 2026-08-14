/**
 * Unit card — listOpen never invents a mark
 * 1. Promise: GET /positions list is residual margin + entry, mark stays null unless close extras
 * 2. Break: listOpen calls marks.markPrice or presentPosition(row, { markPrice: '0' })
 * 3. Done bar: source maps presentPosition(row) only; no markPrice( in listOpen
 * 4. Class N
 * 5. Paths: svc-trade/src/futures/position-service.ts
 * 6. RED: listOpen body contains markPrice(
 * 7. Collision: none — #1868 is capabilities profit-source
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'position-service.ts'), 'utf8');

describe('listOpen does not invent marks', () => {
  it('listOpen presents rows with no extras — markPrice stays null on the list door', () => {
    const listOpen = src.slice(src.indexOf('async listOpen'), src.indexOf('async open('));
    expect(listOpen).toMatch(/presentPosition\(row\)/);
    expect(listOpen).not.toMatch(/markPrice\s*\(/);
    expect(listOpen).not.toMatch(/presentPosition\(row,/);
  });
});
