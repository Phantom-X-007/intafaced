/**
 * Test inject of the DIRECTION §1 cap. Production ships the same 10× in
 * This file exists so mechanism tests can name an explicit fixture cap
 * without reading env.
 */
import { parseAmount, type Amount } from '@intafaced/ledger-client';

export const TEST_MAX_LEVERAGE = '10';
export const TEST_MAX_LEVERAGE_AMOUNT: Amount = parseAmount(TEST_MAX_LEVERAGE);
