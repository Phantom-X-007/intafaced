from pathlib import Path

svc = Path('services/svc-trade/src/spot/trade-service.ts')
s = svc.read_text()
if 'notifyAffiliatePayout' not in s:
    s = s.replace(
        "import { fireAffiliateAccrue, affiliateLegsAfterFill, NoopAffiliateAccrue, type AffiliateAccruePort } from './affiliate-accrue.js';\n",
        "import { fireAffiliateAccrue, affiliateLegsAfterFill, NoopAffiliateAccrue, type AffiliateAccruePort } from './affiliate-accrue.js';\nimport { fireAffiliatePayout, NoopAffiliatePayout, type AffiliatePayoutPort } from './affiliate-payout.js';\n",
        1,
    )
    s = s.replace(
        '  affiliateAccrue?: AffiliateAccruePort;\n}',
        '  affiliateAccrue?: AffiliateAccruePort;\n\n  /**\n   * Identity affiliate payout after accrue. Default noop. Failures must not\n   * unwind the fill. Body is `{ feeEventId }` only.\n   */\n  affiliatePayout?: AffiliatePayoutPort;\n}',
        1,
    )
    s = s.replace(
        '  private readonly affiliateAccrue: AffiliateAccruePort;\n',
        '  private readonly affiliateAccrue: AffiliateAccruePort;\n  /** Best-effort identity payout after accrue (never fails the fill). */\n  private readonly affiliatePayout: AffiliatePayoutPort;\n',
        1,
    )
    s = s.replace(
        '    this.affiliateAccrue = options.affiliateAccrue ?? new NoopAffiliateAccrue();\n',
        '    this.affiliateAccrue = options.affiliateAccrue ?? new NoopAffiliateAccrue();\n    this.affiliatePayout = options.affiliatePayout ?? new NoopAffiliatePayout();\n',
        1,
    )
    mm = (
        '      await this.notifyAffiliateAccrue({\n'
        '        fillId: fillIdFor(market.id, fill.sequence),\n'
        '        makerUserId: HOUSE_MM_USER_UUID,\n'
        '        takerUserId: taker.userId,\n'
        '        makerFee,\n'
        '        takerFee,\n'
        '        makerFeeAsset,\n'
        '        takerFeeAsset,\n'
        '      });'
    )
    if mm not in s:
        raise SystemExit('mm accrue call not found')
    s = s.replace(mm, mm + mm.replace('notifyAffiliateAccrue', 'notifyAffiliatePayout'), 1)
    classic = (
        '    await this.notifyAffiliateAccrue({\n'
        '      fillId: fillIdFor(market.id, fill.sequence),\n'
        '      makerUserId: maker.userId,\n'
        '      takerUserId: taker.userId,\n'
        '      makerFee,\n'
        '      takerFee,\n'
        '      makerFeeAsset: takerBuys ? market.quoteAsset : market.baseAsset,\n'
        '      takerFeeAsset: takerBuys ? market.baseAsset : market.quoteAsset,\n'
        '    });'
    )
    if classic not in s:
        raise SystemExit('classic accrue call not found')
    s = s.replace(classic, classic + classic.replace('notifyAffiliateAccrue', 'notifyAffiliatePayout'), 1)
    method = '    await fireAffiliateAccrue(this.affiliateAccrue, affiliateLegsAfterFill({ ...input, houseMmUserId: HOUSE_MM_USER_UUID }));\n  }'
    extra = (
        method
        + '\n\n  /** Best-effort payout after accrue; never throws. Fill already committed. */\n'
        + '  private async notifyAffiliatePayout(input: {\n'
        + '    fillId: string;\n'
        + '    makerUserId: string;\n'
        + '    takerUserId: string;\n'
        + '    makerFee: Amount;\n'
        + '    takerFee: Amount;\n'
        + '    makerFeeAsset: string;\n'
        + '    takerFeeAsset: string;\n'
        + '  }): Promise<void> {\n'
        + '    await fireAffiliatePayout(this.affiliatePayout, affiliateLegsAfterFill({ ...input, houseMmUserId: HOUSE_MM_USER_UUID }));\n'
        + '  }'
    )
    if method not in s:
        raise SystemExit('accrue method not found')
    s = s.replace(method, extra, 1)
    if s.count('notifyAffiliatePayout') < 3:
        raise SystemExit('wire incomplete')
    svc.write_text(s)
    print('wired trade-service')
else:
    print('trade-service already wired')

idx = Path('services/svc-trade/src/index.ts')
i = idx.read_text()
if 'createAffiliatePayoutClient' not in i:
    i = i.replace(
        "import { createAffiliateAccrueClient } from './spot/affiliate-accrue.js';\n",
        "import { createAffiliateAccrueClient } from './spot/affiliate-accrue.js';\nimport { createAffiliatePayoutClient } from './spot/affiliate-payout.js';\n",
        1,
    )
    i = i.replace(
        'const affiliateAccrue = createAffiliateAccrueClient(env.IDENTITY_URL, env.INTERNAL_SERVICE_SECRET);\n',
        'const affiliateAccrue = createAffiliateAccrueClient(env.IDENTITY_URL, env.INTERNAL_SERVICE_SECRET);\nconst affiliatePayout = createAffiliatePayoutClient(env.IDENTITY_URL, env.INTERNAL_SERVICE_SECRET);\n',
        1,
    )
    i = i.replace(
        '  affiliateAccrue,\n',
        '  affiliateAccrue,\n  affiliatePayout,\n',
        1,
    )
    idx.write_text(i)
    print('wired index')
else:
    print('index already wired')
