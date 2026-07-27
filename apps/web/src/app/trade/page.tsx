import type { Metadata } from 'next';
import { Panel, StatBlock, Ticker } from '@intafaced/ui';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/components/data-table';
import { DepthLadder, type DepthLevel } from '@/components/depth-ladder';
import styles from './trade.module.css';

/**
 * PRO TERMINAL — layout skeleton (§5.3).
 *
 * This is the frame, not the terminal: four regions (book, chart, ticket,
 * blotter) sized and styled the way the real surface will be, with mock data
 * standing in for the streams §5.3 names — `depth.<market>`, `trades.<market>`,
 * `orders.<userId>`, `positions.<userId>`. The charting library
 * (lightweight-charts) and the ws-gateway client drop into the marked regions
 * without moving anything around them.
 *
 * Nothing here computes. Every price, size and balance is a pre-formatted
 * string, which is what svc-trade and svc-ledger will hand over.
 */

export const metadata: Metadata = {
  title: 'Trade',
};

/** Placeholder for the i18n system being built in a separate worktree. */
const copy = {
  market: 'BTC/USDT',
  marketKind: 'Perpetual',
  panels: {
    book: 'Order book',
    chart: 'BTC/USDT · 15m',
    ticket: 'Order',
    blotter: 'Positions',
    account: 'Account',
    trades: 'Recent trades',
  },
  stats: {
    mark: 'Mark',
    index: 'Index',
    volume: 'Volume · 24h',
    funding: 'Funding · 8h',
    openInterest: 'Open interest',
  },
  ladder: { price: 'Price', size: 'Size', total: 'Total', spread: 'Spread' },
  chart: {
    placeholder: 'Chart surface',
    note: 'Reserved for the depth + candle renderer.',
    timeframes: ['1m', '5m', '15m', '1H', '4H', '1D'],
  },
  ticket: {
    buy: 'Buy / Long',
    sell: 'Sell / Short',
    type: 'Order type',
    types: ['Limit', 'Market', 'Stop', 'Post only'],
    price: 'Price',
    size: 'Size',
    total: 'Total',
    leverage: 'Leverage',
    submit: 'Submit order',
    pending: 'Routing pending svc-trade',
  },
  account: {
    equity: 'Equity',
    available: 'Available',
    margin: 'Margin used',
    unrealised: 'Unrealised PnL',
  },
  blotter: {
    empty: 'No open positions',
  },
  columns: {
    market: 'Market',
    side: 'Side',
    size: 'Size',
    entry: 'Entry',
    mark: 'Mark',
    liq: 'Liq.',
    margin: 'Margin',
    pnl: 'Unrealised',
    time: 'Time',
    price: 'Price',
  },
} as const;

/*
 * Mock streams. Shaped exactly like the ws-gateway payloads so swapping the
 * source is a change of import, not a change of markup.
 */

const asks: DepthLevel[] = [
  { price: '68,418.00', size: '0.412', total: '2.884', depth: 0.86 },
  { price: '68,417.50', size: '0.180', total: '2.472', depth: 0.74 },
  { price: '68,416.00', size: '0.930', total: '2.292', depth: 0.69 },
  { price: '68,415.50', size: '0.244', total: '1.362', depth: 0.41 },
  { price: '68,414.00', size: '0.611', total: '1.118', depth: 0.34 },
  { price: '68,413.00', size: '0.507', total: '0.507', depth: 0.15 },
];

const bids: DepthLevel[] = [
  { price: '68,412.50', size: '0.720', total: '0.720', depth: 0.22 },
  { price: '68,412.00', size: '0.305', total: '1.025', depth: 0.31 },
  { price: '68,411.00', size: '1.144', total: '2.169', depth: 0.65 },
  { price: '68,409.50', size: '0.288', total: '2.457', depth: 0.74 },
  { price: '68,408.00', size: '0.416', total: '2.873', depth: 0.86 },
  { price: '68,405.50', size: '0.502', total: '3.375', depth: 1 },
];

/**
 * Every `value` is display-ready. `delta` is a signed percentage used only to
 * pick a colour — no total is ever derived from it.
 */
interface TerminalStat {
  label: string;
  value: string;
  delta?: string;
  deltaLabel?: string;
}

const headline: TerminalStat[] = [
  { label: copy.stats.mark, value: '68,412.50', delta: '+2.41', deltaLabel: '+2.41% · 24h' },
  { label: copy.stats.index, value: '68,410.18', deltaLabel: 'Composite of 6 venues' },
  { label: copy.stats.volume, value: '$1,284,930,551.00', deltaLabel: 'All venues' },
  { label: copy.stats.funding, value: '+0.0084%', delta: '+0.0084', deltaLabel: 'Next in 02:14:09' },
  { label: copy.stats.openInterest, value: '$418,772,340.00', delta: '-0.63', deltaLabel: '-0.63% · 24h' },
];

const account: TerminalStat[] = [
  { label: copy.account.equity, value: '$184,204.91' },
  { label: copy.account.available, value: '$121,880.04' },
  { label: copy.account.margin, value: '$62,324.87' },
  { label: copy.account.unrealised, value: '+$4,118.62', delta: '+2.29', deltaLabel: '+2.29%' },
];

const positionColumns: DataTableColumn[] = [
  { key: 'market', label: copy.columns.market },
  { key: 'side', label: copy.columns.side },
  { key: 'size', label: copy.columns.size, align: 'right', numeric: true },
  { key: 'entry', label: copy.columns.entry, align: 'right', numeric: true },
  { key: 'mark', label: copy.columns.mark, align: 'right', numeric: true },
  { key: 'liq', label: copy.columns.liq, align: 'right', numeric: true, secondary: true },
  { key: 'margin', label: copy.columns.margin, align: 'right', numeric: true, secondary: true },
  { key: 'pnl', label: copy.columns.pnl, align: 'right', numeric: true },
];

const positions: DataTableRow[] = [
  {
    id: 'p1',
    cells: {
      market: 'BTC/USDT',
      side: 'Long 10x',
      size: '1.250',
      entry: '67,004.00',
      mark: '68,412.50',
      liq: '61,240.00',
      margin: '$8,375.50',
      pnl: '+$1,760.62',
    },
    tones: { side: 'long', pnl: 'long' },
  },
  {
    id: 'p2',
    cells: {
      market: 'ETH/USDT',
      side: 'Short 5x',
      size: '18.400',
      entry: '3,310.40',
      mark: '3,284.10',
      liq: '3,802.10',
      margin: '$12,182.27',
      pnl: '+$483.92',
    },
    tones: { side: 'short', pnl: 'long' },
  },
  {
    id: 'p3',
    cells: {
      market: 'SOL/USDT',
      side: 'Long 3x',
      size: '640.000',
      entry: '188.02',
      mark: '184.62',
      liq: '129.44',
      margin: '$41,767.10',
      pnl: '-$2,176.00',
    },
    tones: { side: 'long', pnl: 'short' },
  },
];

const tradeColumns: DataTableColumn[] = [
  { key: 'price', label: copy.columns.price, numeric: true },
  { key: 'size', label: copy.columns.size, align: 'right', numeric: true },
  { key: 'time', label: copy.columns.time, align: 'right', numeric: true },
];

const trades: DataTableRow[] = [
  { id: 't1', cells: { price: '68,412.50', size: '0.084', time: '14:02:11' }, tones: { price: 'long' } },
  { id: 't2', cells: { price: '68,412.00', size: '0.310', time: '14:02:10' }, tones: { price: 'short' } },
  { id: 't3', cells: { price: '68,413.00', size: '0.026', time: '14:02:08' }, tones: { price: 'long' } },
  { id: 't4', cells: { price: '68,411.00', size: '1.004', time: '14:02:07' }, tones: { price: 'short' } },
  { id: 't5', cells: { price: '68,411.50', size: '0.145', time: '14:02:05' }, tones: { price: 'long' } },
  { id: 't6', cells: { price: '68,414.00', size: '0.402', time: '14:02:02' }, tones: { price: 'long' } },
];

export default function TradePage() {
  return (
    <div className={styles.terminal}>
      <header className={styles.headline}>
        <div className={styles.market}>
          <Ticker symbol={copy.market} price="68,412.50" change="+2.41" />
          <span className={styles.kind}>{copy.marketKind}</span>
        </div>

        <div className={styles.headlineStats}>
          {headline.map((stat) => (
            <StatBlock
              key={stat.label}
              className={styles.headlineStat}
              label={stat.label}
              value={stat.value}
              delta={stat.delta}
              deltaLabel={stat.deltaLabel}
            />
          ))}
        </div>
      </header>

      <div className={styles.grid}>
        {/* Book column, fed by `depth.<market>` and `trades.<market>`. */}
        <div className={styles.bookColumn}>
          <Panel className={styles.flexPanel} title={copy.panels.book} live>
            <DepthLadder asks={asks} bids={bids} lastPrice="68,412.50" spread="0.50 (0.001%)" lastDirection="up" labels={copy.ladder} />
          </Panel>

          <Panel title={copy.panels.trades}>
            <DataTable columns={tradeColumns} rows={trades} />
          </Panel>
        </div>

        {/* Chart and blotter, the centre of the terminal. */}
        <div className={styles.chartColumn}>
          <Panel
            className={styles.chartPanel}
            title={copy.panels.chart}
            actions={
              <div className={styles.timeframes}>
                {copy.chart.timeframes.map((timeframe) => (
                  <span key={timeframe} className={styles.timeframe} data-active={timeframe === '15m' ? 'true' : undefined}>
                    {timeframe}
                  </span>
                ))}
              </div>
            }
          >
            {/*
             * Chart mount point. The renderer attaches here; the surrounding
             * grid never needs to know it arrived.
             */}
            <div className={styles.chartSurface}>
              <span className={styles.chartLabel}>{copy.chart.placeholder}</span>
              <span className={styles.chartNote}>{copy.chart.note}</span>
            </div>
          </Panel>

          <Panel title={copy.panels.blotter}>
            <DataTable columns={positionColumns} rows={positions} emptyLabel={copy.blotter.empty} />
          </Panel>
        </div>

        {/* Ticket column. The §5.2 order path terminates here. */}
        <div className={styles.ticketColumn}>
          <Panel title={copy.panels.ticket}>
            <form className={styles.ticket}>
              <div className={styles.sideToggle} role="group" aria-label={copy.panels.ticket}>
                <button type="button" className={styles.sideButton} data-side="long" aria-pressed="true">
                  {copy.ticket.buy}
                </button>
                <button type="button" className={styles.sideButton} data-side="short" aria-pressed="false">
                  {copy.ticket.sell}
                </button>
              </div>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>{copy.ticket.type}</span>
                <select className={styles.select} defaultValue={copy.ticket.types[0]}>
                  {copy.ticket.types.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>{copy.ticket.price}</span>
                <input className={`${styles.input} if-numeric`} inputMode="decimal" defaultValue="68,412.50" readOnly />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>{copy.ticket.size}</span>
                <input className={`${styles.input} if-numeric`} inputMode="decimal" defaultValue="0.250" readOnly />
              </label>

              <div className={styles.summary}>
                <span className={styles.fieldLabel}>{copy.ticket.total}</span>
                <span className="if-numeric">$17,103.13</span>
              </div>

              <div className={styles.summary}>
                <span className={styles.fieldLabel}>{copy.ticket.leverage}</span>
                <span className="if-numeric">10x</span>
              </div>

              <button type="button" className={styles.submit} disabled>
                {copy.ticket.submit}
              </button>
              <span className={styles.pending}>{copy.ticket.pending}</span>
            </form>
          </Panel>

          <Panel title={copy.panels.account}>
            <div className={styles.accountGrid}>
              {account.map((stat) => (
                <StatBlock key={stat.label} label={stat.label} value={stat.value} delta={stat.delta} deltaLabel={stat.deltaLabel} />
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
