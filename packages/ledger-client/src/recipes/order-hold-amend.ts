import type { Amount } from '../money.js';
import type { AccountRef, EntryInput, PostRequest } from '../types.js';
import { InvalidEntryError } from '../types.js';
import { orderHoldAccount, userAvailable } from '../accounts.js';

const debit = (account: AccountRef, amount: Amount): EntryInput => ({ account, direction: 'debit', amount });
const credit = (account: AccountRef, amount: Amount): EntryInput => ({ account, direction: 'credit', amount });

export interface OrderHoldAmendInput {
  orderId: string;
  userId: string;
  assetId: string;
  amount: Amount;
  sequence: number;
}

/**
 * Extra size on a live order (native qty-up). Same pot as `orderHold`.
 * Sequence in the key so it never collides with the place hold.
 */
export function orderHoldAmend(input: OrderHoldAmendInput): PostRequest {
  if (input.amount <= 0n) throw new InvalidEntryError('order amend hold amount must be positive');
  if (input.sequence < 1) throw new InvalidEntryError('order amend hold sequence must be >= 1');
  return {
    idempotencyKey: `order.hold.amend:${input.orderId}:${input.sequence}`,
    module: 'trade',
    reason: 'order.hold.amend',
    meta: { orderId: input.orderId, sequence: input.sequence },
    entries: [
      credit(userAvailable(input.userId, input.assetId), input.amount),
      debit(orderHoldAccount(input.userId, input.assetId, input.orderId), input.amount),
    ],
  };
}
