#!/usr/bin/env python3
from pathlib import Path

def patch_index(t: str) -> str:
    old_imp = "import { createPayRouter } from './router.js';\n"
    new_imp = old_imp + "import { MerchantPayoutDestinationStore } from './merchant-payout-destination.js';\n"
    if 'MerchantPayoutDestinationStore' not in t:
        if old_imp not in t:
            raise SystemExit('index import not found')
        t = t.replace(old_imp, new_imp, 1)
    old_call = 'createPayRouter(pay, rails, userMoney, subMerchants),'
    new_call = 'createPayRouter(pay, rails, userMoney, subMerchants, new MerchantPayoutDestinationStore(sql)),'
    if old_call in t:
        t = t.replace(old_call, new_call, 1)
    elif 'MerchantPayoutDestinationStore(sql)' not in t:
        raise SystemExit('index createPayRouter call not found')
    return t

def patch_router(t: str) -> str:
    old_imp = "import { PayError, type PayService } from './payment-service.js';\n"
    new_imp = (
        "import { PayError, type PayService } from './payment-service.js';\n"
        "import { DestinationKindError } from './payout-destination.js';\n"
        "import {\n"
        "  assertOnlyPayoutDestinations,\n"
        "  PayoutDestinationMissingError,\n"
        "  type MerchantPayoutDestinations,\n"
        "} from './merchant-payout-destination.js';\n"
    )
    if 'assertOnlyPayoutDestinations' not in t:
        if old_imp not in t:
            raise SystemExit('router pay import not found')
        t = t.replace(old_imp, new_imp, 1)
    old_sig = 'export function createPayRouter(pay: PayService, rails: RailRegistry, userMoney: UserMoneyService, trees: MerchantAreaFence | null = null) {'
    new_sig = 'export function createPayRouter(pay: PayService, rails: RailRegistry, userMoney: UserMoneyService, trees: MerchantAreaFence | null = null, destinations: MerchantPayoutDestinations = assertOnlyPayoutDestinations()) {'
    if old_sig in t:
        t = t.replace(old_sig, new_sig, 1)
    elif 'destinations: MerchantPayoutDestinations' not in t:
        raise SystemExit('router signature not found')

    if 'setPayoutDestination:' not in t:
        needle = '      /** Current merchant for the principal'
        idx = t.find(needle)
        if idx < 0:
            raise SystemExit('router me comment not found')
        insert = """      /**
       * Persist a payout destination through assertPayoutDestinationKind
       * (IBAN / IFSC / EVM) so a later payout has a real ref before withdrawHold.
       */
      setPayoutDestination: scopedProcedure('pay:write', { module: 'pay' })
        .input(
          z.object({
            merchantId: z.string().uuid(),
            railId: z.string().min(1),
            kind: z.string().min(1),
            ref: z.string().min(1),
          }),
        )
        .output(z.object({ kind: z.string(), ref: z.string(), railId: z.string() }))
        .mutation(({ ctx, input }) =>
          wrap(async () => {
            await assertAccess(ctx.principal?.userId, input.merchantId, 'settlement.payout');
            const dest = await destinations.persist(input);
            return { ...dest, railId: input.railId };
          }),
        ),

"""
        t = t[:idx] + insert + t[idx:]

    old_dest = '            destination: z.object({ kind: z.string().min(1), ref: z.string().min(1) }),'
    new_dest = '            destination: z.object({ kind: z.string().min(1), ref: z.string().min(1) }).optional(),'
    p = t.find("payout: scopedProcedure('pay:payout'")
    if p < 0:
        raise SystemExit('payout procedure not found')
    after = t[p:]
    dest_pos = after.find('destination:')
    if dest_pos < 0:
        raise SystemExit('payout destination field not found')
    window = after[dest_pos:dest_pos + 140]
    if '.optional()' not in window:
        loc = t.find(old_dest, p)
        if loc < 0:
            raise SystemExit('payout destination field exact not found')
        t = t[:loc] + new_dest + t[loc + len(old_dest):]

    old_ret = '            return toSettlementOut(await pay.payoutSettlement(input));'
    new_ret = """            const destination = input.destination
              ? await destinations.persist({
                  merchantId: settlement.merchantId,
                  railId: input.railId,
                  kind: input.destination.kind,
                  ref: input.destination.ref,
                })
              : await destinations.require({ merchantId: settlement.merchantId, railId: input.railId });
            return toSettlementOut(await pay.payoutSettlement({ ...input, destination }));"""
    if 'destinations.require' not in t:
        if old_ret not in t:
            raise SystemExit('payoutSettlement return not found')
        t = t.replace(old_ret, new_ret, 1)

    old_trpc = '  if (!(err instanceof PayError)) return err;'
    new_trpc = """  if (err instanceof DestinationKindError) {
    return new TRPCError({ code: 'BAD_REQUEST', message: `${err.code}: ${err.message}`, cause: err });
  }
  if (err instanceof PayoutDestinationMissingError) {
    return new TRPCError({ code: 'PRECONDITION_FAILED', message: `${err.code}: ${err.message}`, cause: err });
  }
  if (!(err instanceof PayError)) return err;"""
    if 'PayoutDestinationMissingError' not in t:
        if old_trpc not in t:
            raise SystemExit('toTrpcError PayError guard not found')
        t = t.replace(old_trpc, new_trpc, 1)
    return t

def patch_schema(t: str) -> str:
    if 'merchantPayoutDestinations' not in t:
        marker = 'export const schema = {'
        table = """
/**
 * Where a merchant is paid out — kind+ref asserted through
 * `assertPayoutDestinationKind` before insert. One row per (merchant, rail).
 * Loaded by payout so withdrawHold never runs against an invented dest.
 */
export const merchantPayoutDestinations = pay.table(
  'merchant_payout_destinations',
  {
    merchantId: uuid('merchant_id')
      .notNull()
      .references(() => merchants.id),
    railId: text('rail_id').notNull(),
    kind: text('kind').notNull(),
    ref: text('ref').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ name: 'merchant_payout_destinations_pkey', columns: [t.merchantId, t.railId] })],
);

"""
        if marker not in t:
            raise SystemExit('schema export not found')
        t = t.replace(marker, table + marker, 1)
    if 'merchantPayoutDestinations,' not in t.split('export const schema')[1]:
        t = t.replace('  merchants,\n', '  merchants,\n  merchantPayoutDestinations,\n', 1)
    return t

def main() -> None:
    pairs = [
        (Path('services/svc-pay/src/index.ts'), patch_index),
        (Path('services/svc-pay/src/router.ts'), patch_router),
        (Path('services/svc-pay/src/db/schema.ts'), patch_schema),
    ]
    for path, fn in pairs:
        path.write_text(fn(path.read_text()))
        print(f'patched {path}')

if __name__ == '__main__':
    main()
