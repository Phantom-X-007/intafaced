import { transaction } from '@intafaced/db';
import { parseAmount } from '@intafaced/ledger-client';
import type { Sql } from 'postgres';
import type { PplnsInput } from './pplns.js';

export const EPOCH_UNSET = 'mining.epoch_unset';
export const EMISSION_UNPUBLISHED = 'mining.emission_unpublished';
export const PG_UNAVAILABLE = 'mining.pg_unavailable';
export const WINDOW_PAID = 'mining.window_paid';

export async function persistWindowShares(sql: Sql, input: PplnsInput): Promise<void> {
  parseAmount(input.reward);
  const epoch = input.epoch;
  await transaction(sql, async (tx) => {
    await tx`
      INSERT INTO mining_pool.windows (window_id, epoch, asset_id, reward, fee_bps, status)
      VALUES (
        ${input.windowId},
        ${epoch === undefined ? null : epoch},
        ${input.assetId},
        ${input.reward},
        ${input.feeBps},
        'open'
      )
      ON CONFLICT (window_id) DO UPDATE SET
        epoch = COALESCE(mining_pool.windows.epoch, EXCLUDED.epoch)
      WHERE mining_pool.windows.status = 'open'
    `;
    const [row] = await tx<{ status: string }[]>`
      SELECT status FROM mining_pool.windows WHERE window_id = ${input.windowId}
    `;
    if (!row) throw new Error(PG_UNAVAILABLE);
    if (row.status !== 'open') throw new Error(WINDOW_PAID);
    for (const share of input.shares) {
      if (share.weight <= 0n) continue;
      await tx`
        INSERT INTO mining_pool.shares (share_id, window_id, miner_id, weight)
        VALUES (${share.shareId}, ${input.windowId}, ${share.minerId}, ${share.weight.toString()})
      `;
    }
  });
}
