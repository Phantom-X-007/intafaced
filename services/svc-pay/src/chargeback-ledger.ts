import { recipes, type Amount, type LedgerClient } from '@intafaced/ledger-client';

/** Posts only the ledger-client opening recipe; leg policy lives in that recipe. */
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
