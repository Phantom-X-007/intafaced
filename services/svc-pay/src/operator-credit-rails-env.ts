import { z } from 'zod';

/** Owner operator-credit allow-list. Blank / unset / whitespace → refuse. Never invent `card-sandbox`. */
export const operatorCreditRailsSchema = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .refine((rails) => rails.length > 0, { message: 'PAY_OPERATOR_CREDIT_RAILS is unset' });
