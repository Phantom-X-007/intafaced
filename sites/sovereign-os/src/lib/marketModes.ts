/** Demo market modes for hover-driven terminal. All numbers illustrative. */

export type MarketMode = 'spot' | 'perp' | 'opt' | 'otc';

export type PairRow = { s: string; p: string; c: string; up: boolean };
export type BookRow = { p: number; s: number };

export type ModeConfig = {
  id: MarketMode;
  label: string;
  blurb: string;
  symbol: string;
  meta: string;
  mark: string;
  change: string;
  up: boolean;
  seed: number;
  pairs: PairRow[];
  asks: BookRow[];
  bids: BookRow[];
  footer: { k: string; v: string }[];
  ticket: { buy: string; sell: string; sizeLabel: string; size: string; note: string };
  panel: 'book' | 'chain' | 'rfq';
};

export const MODES: ModeConfig[] = [
  {
    id: 'spot',
    label: 'Spot',
    blurb: 'Cash markets. Convert. Full depth when live.',
    symbol: 'BTC-USD',
    meta: 'SPOT · CASH',
    mark: '67,390.0',
    change: '+2.3%',
    up: true,
    seed: 67390,
    pairs: [
      { s: 'BTC-USD', p: '67,390', c: '+2.3%', up: true },
      { s: 'ETH-USD', p: '3,408', c: '+0.9%', up: true },
      { s: 'SOL-USD', p: '178.2', c: '−0.4%', up: false },
      { s: 'EUR-USD', p: '1.084', c: '+0.1%', up: true },
      { s: 'USDT-USD', p: '1.000', c: '0.0%', up: true },
      { s: 'ARB-USD', p: '0.841', c: '−1.6%', up: false },
    ],
    asks: [
      { p: 67395.5, s: 0.4 },
      { p: 67398.0, s: 1.1 },
      { p: 67402.2, s: 0.7 },
      { p: 67408.0, s: 2.0 },
    ],
    bids: [
      { p: 67388.0, s: 1.3 },
      { p: 67382.5, s: 0.9 },
      { p: 67375.0, s: 2.4 },
      { p: 67368.0, s: 0.6 },
    ],
    footer: [
      { k: '24h vol', v: '$420M' },
      { k: 'Spread', v: '2.1 bps' },
      { k: 'Mode', v: 'Cash' },
    ],
    ticket: { buy: 'BUY BTC', sell: 'SELL BTC', sizeLabel: 'Size (BTC)', size: '0.05', note: 'Spot ticket · demo' },
    panel: 'book',
  },
  {
    id: 'perp',
    label: 'Perpetuals',
    blurb: 'Cross / isolated. Mark. Funding. Liquidation on the book.',
    symbol: 'BTC-PERP',
    meta: 'CROSS · 20×',
    mark: '67,412.2',
    change: '+2.4%',
    up: true,
    seed: 67412,
    pairs: [
      { s: 'BTC-PERP', p: '67,412', c: '+2.4%', up: true },
      { s: 'ETH-PERP', p: '3,412', c: '+1.1%', up: true },
      { s: 'SOL-PERP', p: '178.4', c: '−0.6%', up: false },
      { s: 'ARB-PERP', p: '0.842', c: '−1.8%', up: false },
      { s: 'DOGE-PERP', p: '0.148', c: '+4.2%', up: true },
      { s: 'OP-PERP', p: '2.14', c: '+0.8%', up: true },
    ],
    asks: [
      { p: 67418.4, s: 0.4 },
      { p: 67415.0, s: 1.55 },
      { p: 67412.8, s: 0.9 },
      { p: 67422.1, s: 2.3 },
    ],
    bids: [
      { p: 67410.2, s: 1.24 },
      { p: 67408.5, s: 0.82 },
      { p: 67405.1, s: 2.1 },
      { p: 67401.0, s: 0.45 },
    ],
    footer: [
      { k: 'OI', v: '$1.2B' },
      { k: '24h vol', v: '$840M' },
      { k: 'Funding', v: '+0.012%' },
    ],
    ticket: { buy: 'BUY BTC-PERP', sell: 'SELL BTC-PERP', sizeLabel: 'Size (BTC)', size: '0.10', note: 'Perp ticket · demo' },
    panel: 'book',
  },
  {
    id: 'opt',
    label: 'Options',
    blurb: 'Chain view on the same desk chrome. Path live later.',
    symbol: 'BTC-OPT',
    meta: 'EXP 28 MAR · IV 48%',
    mark: '67,400',
    change: 'ATM',
    up: true,
    seed: 67400,
    pairs: [
      { s: 'BTC 68C', p: '1,240', c: '+8%', up: true },
      { s: 'BTC 67C', p: '2,110', c: '+3%', up: true },
      { s: 'BTC 66P', p: '980', c: '−2%', up: false },
      { s: 'ETH 3500C', p: '88', c: '+5%', up: true },
      { s: 'ETH 3200P', p: '64', c: '−1%', up: false },
      { s: 'SOL 180C', p: '6.2', c: '+12%', up: true },
    ],
    asks: [
      { p: 2140, s: 12 },
      { p: 2110, s: 40 },
      { p: 2080, s: 18 },
      { p: 2050, s: 9 },
    ],
    bids: [
      { p: 2020, s: 22 },
      { p: 1990, s: 15 },
      { p: 1960, s: 30 },
      { p: 1930, s: 11 },
    ],
    footer: [
      { k: 'IV', v: '48%' },
      { k: 'Delta', v: '0.52' },
      { k: 'Expiry', v: '28d' },
    ],
    ticket: { buy: 'BUY CALL', sell: 'SELL PUT', sizeLabel: 'Contracts', size: '5', note: 'Options path · demo' },
    panel: 'chain',
  },
  {
    id: 'otc',
    label: 'OTC',
    blurb: 'Block size. RFQ. Settlement on the plane you choose.',
    symbol: 'BTC-OTC',
    meta: 'RFQ · BLOCK',
    mark: '67,385',
    change: '−8 bps',
    up: false,
    seed: 67385,
    pairs: [
      { s: 'BTC block', p: '50+', c: 'RFQ', up: true },
      { s: 'ETH block', p: '500+', c: 'RFQ', up: true },
      { s: 'USDT', p: '1M+', c: 'RFQ', up: true },
      { s: 'EUR', p: '250k+', c: 'RFQ', up: true },
      { s: 'AED', p: '1M+', c: 'RFQ', up: true },
      { s: 'RWA', p: 'custom', c: 'RFQ', up: true },
    ],
    asks: [
      { p: 67395, s: 12 },
      { p: 67400, s: 25 },
      { p: 67410, s: 40 },
      { p: 67425, s: 18 },
    ],
    bids: [
      { p: 67370, s: 20 },
      { p: 67355, s: 35 },
      { p: 67340, s: 15 },
      { p: 67320, s: 50 },
    ],
    footer: [
      { k: 'Min size', v: '10 BTC' },
      { k: 'Settle', v: 'T+0 / plane' },
      { k: 'Mode', v: 'RFQ' },
    ],
    ticket: { buy: 'REQUEST QUOTE', sell: 'OFFER BLOCK', sizeLabel: 'Size (BTC)', size: '25', note: 'OTC RFQ · demo' },
    panel: 'rfq',
  },
];

export function modeById(id: MarketMode): ModeConfig {
  return MODES.find((m) => m.id === id) ?? MODES[1]!;
}
