import { PayError, type PayService } from './payment-service.js';

/**
 * DOES THIS PRINCIPAL OWN THIS MERCHANT? — asked in exactly one place.
 *
 * The rule is three lines and it is the only thing standing between a merchant
 * id in a query string and somebody else's payment history. It used to live
 * inside `router.ts` as a private helper that threw a `TRPCError`, which was
 * correct while tRPC was the only way in.
 *
 * `pay.public-api` adds a second way in (docs/adr/2026-08-07-pay-public-api-law.md),
 * and the ADR's rule for it is that REST is a TRANSLATION: "any behaviour that
 * differs between REST and tRPC is a defect in the REST layer". A rule copied
 * into two files is a rule with two futures — so it moved here, and both
 * surfaces call it. The transports differ only in how they render the refusal:
 * tRPC maps it to FORBIDDEN, REST to 403.
 *
 * Throws `PayError` rather than a transport error for the same reason: a domain
 * refusal that already knows about HTTP cannot be reused by anything that is
 * not HTTP.
 */
export async function assertMerchantOwnership(pay: PayService, principalUserId: string | undefined, merchantId: string): Promise<void> {
  const merchant = await pay.getMerchant(merchantId);

  /**
   * `undefined !== undefined` is false, so an anonymous principal must never
   * reach a merchant row whose `userId` is also absent. It cannot today —
   * `scopedProcedure` and the REST scope check both refuse before this — but
   * the guard is one comparison and the failure it prevents is silent.
   */
  if (principalUserId === undefined || merchant.userId !== principalUserId) {
    throw new PayError('This merchant belongs to another user', 'pay.merchant_forbidden');
  }
}
