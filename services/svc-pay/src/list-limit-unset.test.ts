import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PayError,
  assertDueSubscriptionsBatchLimit,
  assertExecutionListLimit,
  assertMandateListLimit,
  assertPaymentListLimit,
  assertSettlementListLimit,
  assertSubscriptionListLimit,
  assertWebhookDeliveryListLimit,
  assertWithdrawalListLimit,
} from './payment-service.js';
import { KybError, assertKybHistoryLimit } from './kyb-service.js';
import { PspModeError, assertPricingHistoryLimit } from './psp-mode.js';
import { MerchantStateError, assertMerchantStateHistoryLimit } from './merchant-state-service.js';
import { SubMerchantError, assertPermissionHistoryLimit, assertSubMerchantListLimit } from './submerchants.js';
import { UserMoneyService } from './user-money-service.js';

/**
 * List/history page size is refuse-closed when unset (tRPC + REST).
 *
 * Omit used to invent a 50-row (or 100-row) page. Blank must refuse.
 * Owner/client may pass 50 / 100 explicitly.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function refusePay(fn: (n: number | undefined) => number, code: string) {
  expect(() => fn(undefined)).toThrow(PayError);
  expect(() => fn(Number.NaN)).toThrow(PayError);
  expect(() => fn(0)).toThrow(PayError);
  try {
    fn(undefined);
    throw new Error('expected refuse');
  } catch (e) {
    expect(e).toBeInstanceOf(PayError);
    expect((e as PayError).code).toBe(code);
    expect((e as PayError).message).not.toMatch(/default 50|50-row/i);
  }
}

describe('svc-pay list/history limit unset refuse', () => {
  it('payment/settlement/withdrawal asserts refuse blank / NaN / 0 — never invent 50', () => {
    refusePay(assertPaymentListLimit, 'pay.payment_list_limit_unset');
    refusePay(assertSettlementListLimit, 'pay.settlement_list_limit_unset');
    refusePay(assertWithdrawalListLimit, 'pay.withdrawal_list_limit_unset');
  });

  it('webhook/subscription list asserts refuse blank / NaN / 0 — never invent 50', () => {
    refusePay(assertWebhookDeliveryListLimit, 'pay.webhook_delivery_list_limit_unset');
    refusePay(assertMandateListLimit, 'pay.subscription_mandate_list_limit_unset');
    refusePay(assertSubscriptionListLimit, 'pay.subscription_list_limit_unset');
    refusePay(assertExecutionListLimit, 'pay.subscription_execution_list_limit_unset');
  });

  it('runDueSubscriptions worker batch refuses blank / NaN — never invent 50; owner may pass 50', () => {
    refusePay(assertDueSubscriptionsBatchLimit, 'pay.due_subscriptions_batch_limit_unset');
    expect(assertDueSubscriptionsBatchLimit(50)).toBe(50);
    expect(assertDueSubscriptionsBatchLimit(1)).toBe(1);
    expect(assertDueSubscriptionsBatchLimit(500)).toBe(500);
    expect(() => assertDueSubscriptionsBatchLimit(0)).toThrow(PayError);
    expect(() => assertDueSubscriptionsBatchLimit(501)).toThrow(PayError);
    try {
      assertDueSubscriptionsBatchLimit(10_000);
      throw new Error('expected refuse');
    } catch (e) {
      expect(e).toBeInstanceOf(PayError);
      expect((e as PayError).code).toBe('pay.validation_failed');
    }
  });

  it('accepts owner-published 50 and caps at 200', () => {
    expect(assertPaymentListLimit(50)).toBe(50);
    expect(assertSettlementListLimit(50)).toBe(50);
    expect(assertWithdrawalListLimit(50)).toBe(50);
    expect(assertWebhookDeliveryListLimit(50)).toBe(50);
    expect(assertMandateListLimit(50)).toBe(50);
    expect(assertSubscriptionListLimit(50)).toBe(50);
    expect(assertExecutionListLimit(50)).toBe(50);
    expect(assertPaymentListLimit(1)).toBe(1);
    expect(assertPaymentListLimit(200)).toBe(200);
    expect(assertPaymentListLimit(201)).toBe(200);
  });

  it('kyb/psp/merchantState/permission history refuse blank — never invent 50', () => {
    expect(() => assertKybHistoryLimit(undefined)).toThrow(KybError);
    expect(() => assertPricingHistoryLimit(undefined)).toThrow(PspModeError);
    expect(() => assertMerchantStateHistoryLimit(undefined)).toThrow(MerchantStateError);
    expect(() => assertPermissionHistoryLimit(undefined)).toThrow(SubMerchantError);
    expect(() => assertKybHistoryLimit(0)).toThrow(KybError);
    try {
      assertKybHistoryLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect((e as KybError).code).toBe('pay.kyb_history_limit_unset');
    }
    try {
      assertPricingHistoryLimit(Number.NaN);
      throw new Error('expected refuse');
    } catch (e) {
      expect((e as PspModeError).code).toBe('pay.psp_pricing_history_limit_unset');
    }
    try {
      assertMerchantStateHistoryLimit(0);
      throw new Error('expected refuse');
    } catch (e) {
      expect((e as MerchantStateError).code).toBe('pay.merchant_state_history_limit_unset');
    }
    try {
      assertPermissionHistoryLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect((e as SubMerchantError).code).toBe('pay.submerchant_permission_history_limit_unset');
    }
  });

  it('submerchant.list refuses blank — never invent 100; owner may pass 100', () => {
    expect(() => assertSubMerchantListLimit(undefined)).toThrow(SubMerchantError);
    expect(() => assertSubMerchantListLimit(0)).toThrow(SubMerchantError);
    try {
      assertSubMerchantListLimit(undefined);
      throw new Error('expected refuse');
    } catch (e) {
      expect((e as SubMerchantError).code).toBe('pay.submerchant_list_limit_unset');
      expect((e as SubMerchantError).message).not.toMatch(/default 100|100-row/i);
    }
    expect(assertSubMerchantListLimit(100)).toBe(100);
    expect(assertSubMerchantListLimit(1)).toBe(1);
    expect(assertSubMerchantListLimit(500)).toBe(500);
    expect(assertSubMerchantListLimit(501)).toBe(500);
  });

  it('listWithdrawals refuses without limit — never invents 50', async () => {
    const money = new UserMoneyService({} as never, {} as never, {} as never, { operatorCreditRails: [] });
    await expect(money.listWithdrawals('user')).rejects.toMatchObject({
      code: 'pay.withdrawal_list_limit_unset',
    });
    expect(assertWithdrawalListLimit(50)).toBe(50);
  });

  it('services no longer default list/history limit to 50/100', () => {
    const pay = readFileSync(join(ROOT, 'services/svc-pay/src/payment-service.ts'), 'utf8');
    const listPayStart = pay.indexOf('async listPayments(');
    const listPay = pay.slice(listPayStart, pay.indexOf('async createProfile(', listPayStart));
    expect(listPay).toContain('assertPaymentListLimit');
    expect(listPay).not.toMatch(/\?\? 50/);
    const listSetStart = pay.indexOf('async listSettlements(');
    const listSet = pay.slice(listSetStart, pay.indexOf('async getPayment(', listSetStart));
    expect(listSet).toContain('assertSettlementListLimit');
    expect(listSet).not.toMatch(/\?\? 50/);

    const money = readFileSync(join(ROOT, 'services/svc-pay/src/user-money-service.ts'), 'utf8');
    const listW = money.slice(money.indexOf('async listWithdrawals('), money.indexOf('async availableBalance('));
    expect(listW).toContain('assertWithdrawalListLimit');
    expect(listW).not.toMatch(/limit = 50/);
    expect(listW).not.toMatch(/\?\? 50/);

    const kyb = readFileSync(join(ROOT, 'services/svc-pay/src/kyb-service.ts'), 'utf8');
    const kybH = kyb.slice(kyb.indexOf('async history('), kyb.indexOf('async currentStatus('));
    expect(kybH).toContain('assertKybHistoryLimit');
    expect(kybH).not.toMatch(/limit = 50/);

    const psp = readFileSync(join(ROOT, 'services/svc-pay/src/psp-mode.ts'), 'utf8');
    const pspH = psp.slice(psp.indexOf('async pricingHistory('), psp.indexOf('async enablePspMode('));
    expect(pspH).toContain('assertPricingHistoryLimit');
    expect(pspH).not.toMatch(/limit = 50/);

    const state = readFileSync(join(ROOT, 'services/svc-pay/src/merchant-state-service.ts'), 'utf8');
    const stateH = state.slice(state.indexOf('async history('), state.indexOf('async currentStatus('));
    expect(stateH).toContain('assertMerchantStateHistoryLimit');
    expect(stateH).not.toMatch(/limit = 50/);

    const sub = readFileSync(join(ROOT, 'services/svc-pay/src/submerchants.ts'), 'utf8');
    const listSub = sub.slice(sub.indexOf('async listSubMerchants('), sub.indexOf('async getSubMerchant('));
    expect(listSub).toContain('assertSubMerchantListLimit');
    expect(listSub).not.toMatch(/limit = 100/);
    const permH = sub.slice(sub.indexOf('async permissionHistory('));
    expect(permH).toContain('assertPermissionHistoryLimit');
    expect(permH).not.toMatch(/limit = 50/);

    const webhooks = readFileSync(join(ROOT, 'services/svc-pay/src/merchant-webhooks.ts'), 'utf8');
    const listD = webhooks.slice(webhooks.indexOf('async listDeliveries('), webhooks.indexOf('async processDue('));
    expect(listD).toContain('assertWebhookDeliveryListLimit');
    expect(listD).not.toMatch(/\?\? 50/);

    const subs = readFileSync(join(ROOT, 'services/svc-pay/src/subscriptions/subscription-service.ts'), 'utf8');
    const listM = subs.slice(subs.indexOf('async listMandates('), subs.indexOf('async listSubscriptions('));
    expect(listM).toContain('assertMandateListLimit');
    expect(listM).not.toMatch(/\?\? 50/);
    const listS = subs.slice(subs.indexOf('async listSubscriptions('), subs.indexOf('async listCycles('));
    expect(listS).toContain('assertSubscriptionListLimit');
    expect(listS).not.toMatch(/\?\? 50/);
    const listE = subs.slice(subs.indexOf('async listExecutions('), subs.indexOf('async pauseSubscription('));
    expect(listE).toContain('assertExecutionListLimit');
    expect(listE).not.toMatch(/\?\? 50/);
    const due = subs.slice(subs.indexOf('async runDueSubscriptions('), subs.indexOf('private async runOneSubscription('));
    expect(due).toContain('assertDueSubscriptionsBatchLimit');
    expect(due).not.toMatch(/\?\? 50/);
  });

  it('routers do not invent 50/100 when list/history omits limit', () => {
    const router = readFileSync(join(ROOT, 'services/svc-pay/src/router.ts'), 'utf8');
    const mine = router.slice(router.indexOf('mine: scopedProcedure'), router.indexOf('balance: scopedProcedure'));
    expect(mine).toContain('listWithdrawals(ctx.principal.userId, input?.limit)');
    expect(mine).not.toMatch(/input\?\.limit \?\? 50/);

    const kybR = readFileSync(join(ROOT, 'services/svc-pay/src/kyb-router.ts'), 'utf8');
    expect(kybR).toContain('kyb.history(input.merchantId, input.limit)');
    expect(kybR).toContain('psp.pricingHistory(input.merchantId, input.limit)');
    expect(kybR).not.toMatch(/\?\? 50/);

    const stateR = readFileSync(join(ROOT, 'services/svc-pay/src/merchant-state-router.ts'), 'utf8');
    expect(stateR).toContain('state.history(input.merchantId, input.limit)');
    expect(stateR).not.toMatch(/\?\? 50/);

    const subR = readFileSync(join(ROOT, 'services/svc-pay/src/submerchant-router.ts'), 'utf8');
    expect(subR).toContain('listSubMerchants(actorMerchantId, input.merchantId, input.limit)');
    expect(subR).toContain('permissionHistory(actorMerchantId, input.subjectMerchantId, input.limit)');
    expect(subR).not.toMatch(/\?\? 50/);
    expect(subR).not.toMatch(/\?\? 100/);

    const rest = readFileSync(join(ROOT, 'services/svc-pay/src/public-rest.ts'), 'utf8');
    expect(rest).not.toMatch(/DEFAULT_LIMIT/);
    const payList = rest.slice(rest.indexOf('`${BASE}/payments`'), rest.indexOf('`${BASE}/balances`'));
    expect(payList).toContain('limit: req.query.limit');
    expect(payList).not.toMatch(/\?\? 50/);
    expect(payList).not.toMatch(/default: /);
    const hookStart = rest.indexOf('`${BASE}/webhook-deliveries`');
    const hookList = rest.slice(hookStart, rest.indexOf('PayFac permission product path', hookStart));
    expect(hookList).toContain('limit: req.query.limit');
    expect(hookList).not.toMatch(/\?\? 50/);
    expect(hookList).not.toMatch(/default: /);
    expect(rest).toContain('req.query.subjectMerchantId, req.query.limit');
    expect(rest).not.toMatch(/req\.query\.limit \?\? 50/);

    const subRouter = readFileSync(join(ROOT, 'services/svc-pay/src/subscription-router.ts'), 'utf8');
    expect(subRouter).toContain('limit: input.limit');
    expect(subRouter).not.toMatch(/\?\? 50/);

    const cycle = readFileSync(join(ROOT, 'services/svc-pay/src/subscriptions/internal-cycle-routes.ts'), 'utf8');
    expect(cycle).toContain('assertDueSubscriptionsBatchLimit');
    expect(cycle).not.toMatch(/limit === undefined \? \{\}/);
    expect(cycle).not.toMatch(/\?\? 50/);
  });
});
