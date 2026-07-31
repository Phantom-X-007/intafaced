import { describe, expect, it } from 'vitest';
import { parseAmount as amt } from '@intafaced/ledger-client';
import { memoryFundingPositionLoader, memoryLiquidationPositionLoader } from './position-loaders.js';

describe('memory position loaders', () => {
  it('funding loader returns injected rows only (no invent)', async () => {
    const rows = [
      {
        positionId: 'p1',
        userId: '11111111-1111-4111-8111-111111111111',
        side: 'long' as const,
        size: amt('1'),
        entryPrice: amt('100'),
        marginAsset: 'USDT',
      },
    ];
    const loader = memoryFundingPositionLoader(rows);
    expect(await loader.listOpenForMarket('m1')).toEqual(rows);
  });

  it('empty memory loaders stay empty', async () => {
    expect(await memoryFundingPositionLoader([]).listOpenForMarket('m1')).toEqual([]);
    expect(await memoryLiquidationPositionLoader([]).listOpen()).toEqual([]);
  });
});
