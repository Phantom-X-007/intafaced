import { z } from 'zod';

/** Decimal string. Never a JSON number. At most 18 fraction digits. */
export const decimalString = z.string().regex(/^\d+(\.\d{1,18})?$/, 'amounts are positive decimal strings with at most 18 decimal places');

export const supportedBeginStringSchema = z.enum(['FIX.4.2', 'FIX.4.4', 'FIX.5.0', 'FIXT.1.1']);
export type SupportedBeginString = z.infer<typeof supportedBeginStringSchema>;

export const matchingOrderCommandSchema = z.object({
  kind: z.literal('new_order_single'),
  clOrdId: z.string().min(1),
  beginString: supportedBeginStringSchema,
  applVerId: z.string().min(1).optional(),
  symbol: z.string().min(1),
  side: z.enum(['buy', 'sell']),
  ordType: z.enum(['market', 'limit']),
  qty: decimalString,
  price: decimalString.nullable(),
});

export type MatchingOrderCommand = z.infer<typeof matchingOrderCommandSchema>;

export const adaptErrorSchema = z.object({
  code: z.enum([
    'unsupported_begin_string',
    'unsupported_appl_ver',
    'unsupported_msg_type',
    'unsupported_tag',
    'unsupported_side',
    'unsupported_ord_type',
    'missing_cl_ord_id',
    'missing_qty',
    'missing_price',
    'invalid_decimal',
    'invalid_message',
  ]),
  message: z.string().min(1),
});

export const adaptResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), command: matchingOrderCommandSchema }),
  z.object({ ok: z.literal(false), error: adaptErrorSchema }),
]);

export type AdaptResult = z.infer<typeof adaptResultSchema>;

export function parseMatchingOrderCommand(input: unknown): MatchingOrderCommand {
  return matchingOrderCommandSchema.parse(input);
}
