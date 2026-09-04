import { recipes, type Amount, type LedgerClient } from '@intafaced/ledger-client';

/**
 * Sole production post for chargeback money: ledger-client `chargebackOpen`.
 * Legs are the recipe's two caller-supplied pots — no invented shortfall.
 */
export async function postDisputeOpening(
  ledger: LedgerClient,
  input: {
    disputeId: string;
    paymentId: string;
    merchantId: string;
    merchantUserId: string;
    assetId: string;
    rail: string;
    fromClearing: Amount;
    fromMerchantBalance: Amount;
  },
): Promise<{ txId: string }> {
  const tx = await ledger.post(recipes.chargebackOpen(input));
  return { txId: tx.id };
}
