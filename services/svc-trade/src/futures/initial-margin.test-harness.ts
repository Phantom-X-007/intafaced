/**
 * Test-only leverage cap. Not owner §8. Not imported by production modules.
 *
 * Live host leaves TRADE_FUTURES_MAX_LEVERAGE empty until the owner names it.
 * These values exist so mechanism tests have a coherent ceiling.
 */
import { parseAmount, type Amount } from '@intafaced/ledger-client';

export const TEST_MAX_LEVERAGE = '10';
export const TEST_MAX_LEVERAGE_AMOUNT: Amount = parseAmount(TEST_MAX_LEVERAGE);
