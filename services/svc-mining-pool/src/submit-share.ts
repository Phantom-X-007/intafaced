import type { LedgerClient } from '@intafaced/ledger-client';
import { postPayouts } from './ledger.js';
import { planPplns, type PplnsInput, type PplnsPlan } from './pplns.js';

export async function submitShare(ledger: Pick<LedgerClient, 'post'>, input: PplnsInput): Promise<PplnsPlan> {
  const plan = planPplns(input);
  await postPayouts(ledger, input);
  return plan;
}
