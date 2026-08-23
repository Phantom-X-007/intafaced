import { describe, expect, it } from 'vitest';
import type { Position } from '@intafaced/exchange-contract';
import { presentOpenPositions } from '../private-rest.js';

describe('GET /api/v1/positions presenter', () => {
  it('keeps decimal strings and null valuation fields when no accepted mark was requested', () => {
    const row: Position = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      symbol: 'BTC/USDT-PERP',
      timestamp: 1,
      datetime: '1970-01-01T00:00:00.001Z',
      side: 'long',
      status: 'closing',
      closingReason: 'trade.mark_missing',
      contracts: '1.000000000000000001',
      contractSize: null,
      entryPrice: '50000.000000000000000001',
      markPrice: null,
      notional: '50000.000000000000000001',
      leverage: '2.5',
      collateral: '20000.000000000000000001',
      initialMargin: '20000.000000000000000001',
      maintenanceMargin: null,
      unrealizedPnl: null,
      realizedPnl: null,
      liquidationPrice: null,
      marginMode: 'isolated',
      percentage: null,
    };

    expect(presentOpenPositions([row])).toEqual([
      {
        ...row,
        markSource: null,
      },
    ]);
  });

  it('answers an honest empty array', () => {
    expect(presentOpenPositions([])).toEqual([]);
  });
});
