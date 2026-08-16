from pathlib import Path

def sub(path, old, new, label):
    p = Path(path)
    s = p.read_text()
    if new.strip()[:40] in s and old not in s:
        print(label, 'already')
        return
    if old not in s:
        raise SystemExit(f'{label} missing')
    p.write_text(s.replace(old, new, 1))
    print(label, 'ok')

sub(
    'services/svc-pay/src/payment-service.ts',
    "import { affiliateLegAfterPaySettlement, fireAffiliateAccrue, NoopAffiliateAccrue, type AffiliateAccruePort } from './affiliate-accrue.js';",
    "import { affiliateLegAfterPaySettlement, fireAffiliateAccrue, NoopAffiliateAccrue, type AffiliateAccruePort } from './affiliate-accrue.js';\nimport { fireAffiliatePayout, NoopAffiliatePayout, type AffiliatePayoutPort } from './affiliate-payout.js';",
    'import',
)
sub(
    'services/svc-pay/src/payment-service.ts',
    "  readonly affiliateAccrue?: AffiliateAccruePort;\n\n  /**\n   * Persisted merchant payout destinations.",
    "  readonly affiliateAccrue?: AffiliateAccruePort;\n\n  /**\n   * Identity affiliate payout after accrue. Default noop. Failures must not\n   * unwind settlement. Body is `{ feeEventId }` only.\n   */\n  readonly affiliatePayout?: AffiliatePayoutPort;\n\n  /**\n   * Persisted merchant payout destinations.",
    'option',
)
sub(
    'services/svc-pay/src/payment-service.ts',
    "  private readonly affiliateAccrue: AffiliateAccruePort;\n  private readonly payoutDestinations: MerchantPayoutDestinations;",
    "  private readonly affiliateAccrue: AffiliateAccruePort;\n  private readonly affiliatePayout: AffiliatePayoutPort;\n  private readonly payoutDestinations: MerchantPayoutDestinations;",
    'field',
)
sub(
    'services/svc-pay/src/payment-service.ts',
    "    this.affiliateAccrue = options.affiliateAccrue ?? new NoopAffiliateAccrue();\n    this.payoutDestinations = options.payoutDestinations ?? assertOnlyPayoutDestinations();",
    "    this.affiliateAccrue = options.affiliateAccrue ?? new NoopAffiliateAccrue();\n    this.affiliatePayout = options.affiliatePayout ?? new NoopAffiliatePayout();\n    this.payoutDestinations = options.payoutDestinations ?? assertOnlyPayoutDestinations();",
    'ctor',
)
sub(
    'services/svc-pay/src/payment-service.ts',
    "    await this.notifyPayAffiliateAccrue(posted, merchant.userId);\n    return posted;",
    "    await this.notifyPayAffiliateAccrue(posted, merchant.userId);\n    await this.notifyPayAffiliatePayout(posted, merchant.userId);\n    return posted;",
    'call',
)
sub(
    'services/svc-pay/src/payment-service.ts',
    """  /** Best-effort; never throws. Settlement already committed. */
  private async notifyPayAffiliateAccrue(posted: SettlementRecord, merchantUserId: string): Promise<void> {
    if (posted.status !== 'posted') return;
    await fireAffiliateAccrue(
      this.affiliateAccrue,
      affiliateLegAfterPaySettlement({
        settlementId: posted.id,
        merchantUserId,
        feeAmount: posted.fees,
        feeAsset: posted.assetId,
      }),
    );
  }""",
    """  /** Best-effort; never throws. Settlement already committed. */
  private async notifyPayAffiliateAccrue(posted: SettlementRecord, merchantUserId: string): Promise<void> {
    if (posted.status !== 'posted') return;
    await fireAffiliateAccrue(
      this.affiliateAccrue,
      affiliateLegAfterPaySettlement({
        settlementId: posted.id,
        merchantUserId,
        feeAmount: posted.fees,
        feeAsset: posted.assetId,
      }),
    );
  }

  /** Best-effort payout after accrue; never throws. Settlement already committed. */
  private async notifyPayAffiliatePayout(posted: SettlementRecord, merchantUserId: string): Promise<void> {
    if (posted.status !== 'posted') return;
    await fireAffiliatePayout(
      this.affiliatePayout,
      affiliateLegAfterPaySettlement({
        settlementId: posted.id,
        merchantUserId,
        feeAmount: posted.fees,
        feeAsset: posted.assetId,
      }),
    );
  }""",
    'fn',
)
sub(
    'services/svc-pay/src/index.ts',
    "import { createAffiliateAccrueClient } from './affiliate-accrue.js';",
    "import { createAffiliateAccrueClient } from './affiliate-accrue.js';\nimport { createAffiliatePayoutClient } from './affiliate-payout.js';",
    'idx-import',
)
sub(
    'services/svc-pay/src/index.ts',
    "  affiliateAccrue: env.IDENTITY_URL ? createAffiliateAccrueClient(env.IDENTITY_URL, env.INTERNAL_SERVICE_SECRET) : undefined,",
    "  affiliateAccrue: env.IDENTITY_URL ? createAffiliateAccrueClient(env.IDENTITY_URL, env.INTERNAL_SERVICE_SECRET) : undefined,\n  affiliatePayout: env.IDENTITY_URL ? createAffiliatePayoutClient(env.IDENTITY_URL, env.INTERNAL_SERVICE_SECRET) : undefined,",
    'idx-wire',
)
print('done')
