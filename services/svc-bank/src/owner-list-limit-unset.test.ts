import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BankError } from './errors.js';
import {
  assertCardAuthorizationsListLimit,
  assertCardsListLimit,
  assertEarnPositionsListLimit,
  assertLoansListLimit,
  assertSchedulesListLimit,
  assertSpacesListLimit,
} from './owner-list-limit.js';

/**
 * Owner-list page size is refuse-closed when unset.
 *
 * spaces.list / earn.positions / loans.list / cards.list /
 * cards.authorizations / transfers.listSchedules used to SELECT without LIMIT.
 * Blank must refuse. Owner/client may pass 50 explicitly. Never invent 50.
 *
 * Not milled: catalog pools/products (#4142), job batches, treasury dual-control,
 * earn.accrueAll / markUser / unnamedAssets / spendSummary work sets.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function refuseBank(fn: (n: number | undefined) => number, code: string) {
  expect(() => fn(undefined)).toThrow(BankError);
  expect(() => fn(Number.NaN)).toThrow(BankError);
  expect(() => fn(0)).toThrow(BankError);
  try {
    fn(undefined);
    throw new Error('expected refuse');
  } catch (e) {
    expect(e).toBeInstanceOf(BankError);
    expect((e as BankError).code).toBe(code);
    expect((e as BankError).message).not.toMatch(/default 50|50-row/i);
  }
}

function sliceFn(src: string, startNeedle: string, endNeedle: string): string {
  const start = src.indexOf(startNeedle);
  expect(start).toBeGreaterThan(-1);
  const end = src.indexOf(endNeedle, start + startNeedle.length);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

describe('svc-bank owner lists refuse unset limit', () => {
  it('asserts refuse blank / NaN / 0 — never invent 50', () => {
    refuseBank(assertSpacesListLimit, 'bank.spaces_list_limit_unset');
    refuseBank(assertEarnPositionsListLimit, 'bank.earn_positions_list_limit_unset');
    refuseBank(assertLoansListLimit, 'bank.loans_list_limit_unset');
    refuseBank(assertCardsListLimit, 'bank.cards_list_limit_unset');
    refuseBank(assertCardAuthorizationsListLimit, 'bank.card_authorizations_list_limit_unset');
    refuseBank(assertSchedulesListLimit, 'bank.schedules_list_limit_unset');
  });

  it('accepts owner-published 50 and caps at 200', () => {
    expect(assertSpacesListLimit(50)).toBe(50);
    expect(assertEarnPositionsListLimit(50)).toBe(50);
    expect(assertLoansListLimit(1)).toBe(1);
    expect(assertCardsListLimit(200)).toBe(200);
    expect(assertCardAuthorizationsListLimit(201)).toBe(200);
    expect(assertSchedulesListLimit(201)).toBe(200);
  });

  it('dump methods require the assert and SQL LIMIT — no invented 50', () => {
    const spaces = readFileSync(join(ROOT, 'services/svc-bank/src/spaces/space-service.ts'), 'utf8');
    const list = sliceFn(spaces, 'async list(userId: string, assetId?: string, limit?: number)', 'async balanceOf(');
    expect(list).toContain('assertSpacesListLimit');
    expect(list).toContain('LIMIT ${page}');
    expect(list).not.toMatch(/\?\? 50/);
    expect(list).not.toMatch(/limit = 50/);

    const earn = readFileSync(join(ROOT, 'services/svc-bank/src/earn/earn-service.ts'), 'utf8');
    const positionsOf = sliceFn(earn, 'async positionsOf(', 'async principalOf(');
    expect(positionsOf).toContain('assertEarnPositionsListLimit');
    expect(positionsOf).toContain('LIMIT ${page}');
    expect(positionsOf).not.toMatch(/\?\? 50/);

    const loans = readFileSync(join(ROOT, 'services/svc-bank/src/loans/loan-service.ts'), 'utf8');
    const loansOf = sliceFn(loans, 'async loansOf(', 'async openLoansForMark(');
    expect(loansOf).toContain('assertLoansListLimit');
    expect(loansOf).toContain('LIMIT ${page}');
    expect(loansOf).not.toMatch(/\?\? 50/);

    const cards = readFileSync(join(ROOT, 'services/svc-bank/src/cards/card-service.ts'), 'utf8');
    const cardsOf = sliceFn(cards, 'async cardsOf(', 'async setStatus(');
    expect(cardsOf).toContain('assertCardsListLimit');
    expect(cardsOf).toContain('LIMIT ${page}');
    expect(cardsOf).not.toMatch(/\?\? 50/);

    const authorizationsOf = sliceFn(cards, 'async authorizationsOf(', 'async cashbackFor(');
    expect(authorizationsOf).toContain('assertCardAuthorizationsListLimit');
    expect(authorizationsOf).toContain('LIMIT ${page}');
    expect(authorizationsOf).not.toMatch(/\?\? 50/);

    const transfers = readFileSync(join(ROOT, 'services/svc-bank/src/transfers/transfer-service.ts'), 'utf8');
    const listSchedules = sliceFn(transfers, 'async listSchedules(', 'async cancelSchedule(');
    expect(listSchedules).toContain('assertSchedulesListLimit');
    expect(listSchedules).toContain('LIMIT ${page}');
    expect(listSchedules).not.toMatch(/\?\? 50/);
  });

  it('tRPC owner lists pass optional input.limit — omit is not 50', () => {
    const router = readFileSync(join(ROOT, 'services/svc-bank/src/router.ts'), 'utf8');

    const spacesList = sliceFn(router, 'const spaces = router({', 'unnamed: scopedProcedure');
    expect(spacesList).toContain('limit: z.number().int().min(1).max(200).optional()');
    expect(spacesList).toContain('overview(userId, input.assetId, input.limit)');
    expect(spacesList).not.toMatch(/\?\? 50/);

    const schedules = sliceFn(router, 'listSchedules: scopedProcedure', '/** What actually ran');
    expect(schedules).toContain('limit: z.number().int().min(1).max(200).optional()');
    expect(schedules).toContain('listSchedules(ctx.principal.userId, input?.limit)');
    expect(schedules).not.toMatch(/\?\? 50/);

    const positions = sliceFn(router, 'positions: scopedProcedure', 'const analytics = router');
    expect(positions).toContain('limit: z.number().int().min(1).max(200).optional()');
    expect(positions).toContain('positionsOf(ctx.principal.userId, input?.limit)');
    expect(positions).not.toMatch(/\?\? 50/);

    const loansList = sliceFn(router, 'outstandingPrincipal: amountString', 'id: loan.id');
    expect(router).toContain('loansOf(ctx.principal.userId, input?.limit)');
    expect(loansList).toContain('outstandingPrincipal');
    expect(router).toContain('bank.loans_list_limit_unset');

    const cardsList = sliceFn(
      router,
      "list: scopedProcedure('bank:read', { module: 'bank' })\n      .input(\n        z\n          .object({\n            /**\n             * Page size. Optional so omit reaches `bank.cards_list_limit_unset`",
      'issue: scopedProcedure',
    );
    expect(cardsList).toContain('cardsOf(ctx.principal.userId, input?.limit)');
    expect(cardsList).not.toMatch(/\?\? 50/);

    const auths = sliceFn(router, 'authorizations: scopedProcedure', 'conversion: z');
    expect(auths).toContain('limit: z.number().int().min(1).max(200).optional()');
    expect(router).toContain('authorizationsOf(input.cardId, input.limit)');
    expect(auths).not.toMatch(/\?\? 50/);
  });

  it('work sets stay unbounded — not milled as a page of 50', () => {
    const earn = readFileSync(join(ROOT, 'services/svc-bank/src/earn/earn-service.ts'), 'utf8');
    const accrueAll = sliceFn(earn, 'async accrueAll(', 'async interestPaid(');
    expect(accrueAll).toContain('openPoolsForAccrual');
    expect(accrueAll).not.toMatch(/this\.listPools\(\)/);
    expect(accrueAll).not.toMatch(/\?\? 50/);

    const spaces = readFileSync(join(ROOT, 'services/svc-bank/src/spaces/space-service.ts'), 'utf8');
    const unnamed = sliceFn(spaces, 'async unnamedAssets(', 'async resolveForDebit(');
    expect(unnamed).toContain('namedSpaces');
    expect(unnamed).not.toMatch(/this\.list\(/);
    expect(unnamed).not.toMatch(/\?\? 50/);

    const spend = readFileSync(join(ROOT, 'services/svc-bank/src/analytics/spend.ts'), 'utf8');
    expect(spend).toContain('namedSpaces');
    expect(spend).not.toMatch(/spaces\.list\(/);
    expect(spend).not.toMatch(/\?\? 50/);

    const loans = readFileSync(join(ROOT, 'services/svc-bank/src/loans/loan-service.ts'), 'utf8');
    const markUser = sliceFn(loans, 'async markUser(', 'const quote = loans[0]');
    expect(markUser).toContain('openLoansForMark');
    expect(markUser).not.toMatch(/this\.loansOf\(/);
    expect(markUser).not.toMatch(/\?\? 50/);
  });
});
