import Link from 'next/link';
import { LobbyCard, Panel, RankBadge, StatBlock, Ticker } from '@intafaced/ui';
import styles from './page.module.css';

/**
 * Landing shell.
 *
 * Every value below is mock — there is no market data service yet (§5.2 is
 * unbuilt). What is real is the structure and the token usage: when the feeds
 * land, only the constants at the top of this file change.
 *
 * Money is written as a pre-formatted string, exactly as it will arrive from
 * the ledger. Nothing here is a float, and nothing here is rounded.
 */

/**
 * Placeholder for the i18n system being built in a separate worktree. Keeping
 * every user-facing string in one object per page means extraction is a move,
 * not a rewrite.
 */
const copy = {
  eyebrow: 'Sovereign Operating System',
  wordmark: 'INTAFACED',
  lede: 'Markets, money and identity on one ledger. One account, one verification, one rank — the key that opens every room.',
  primaryCta: 'Enter the terminal',
  secondaryCta: 'View the rooms',
  rankTitle: 'Operator',
  panels: {
    markets: 'Market pulse',
    treasury: 'Ledger snapshot',
    rooms: 'Live rooms',
  },
  actions: {
    live: 'Streaming',
    allMarkets: 'All markets',
    allRooms: 'All rooms',
  },
  stats: {
    volume: 'Volume · 24h',
    settled: 'Settled today',
    openInterest: 'Open interest',
    latency: 'Match latency',
  },
  modules: {
    heading: 'Modules',
    items: [
      { name: 'Trade', detail: 'Spot, futures, options, convert, copy' },
      { name: 'Bank', detail: 'Accounts, yield, loans, sovereign card' },
      { name: 'Pay', detail: 'Gateway, PSP, PayFac, merchant rails' },
      { name: 'P2P', detail: 'Offers, escrow, disputes, reputation' },
      { name: 'Academy', detail: 'Lobbies, curriculum, certification' },
      { name: 'Blueprint', detail: 'Identity Blueprint, Sovereign Intelligence' },
    ],
  },
} as const;

/** Mock tape — the shape `trades.<market>` will stream into (§5.3). */
const markets = [
  { symbol: 'BTC/USDT', price: '68,412.50', change: '+2.41' },
  { symbol: 'ETH/USDT', price: '3,284.10', change: '+1.08' },
  { symbol: 'SOL/USDT', price: '184.62', change: '-0.87' },
  { symbol: 'IFC/USDT', price: '4.1820', change: '+11.36' },
  { symbol: 'XAU/USDT', price: '2,391.44', change: '+0.12' },
] as const;

/**
 * Mock ledger figures. Money is a pre-formatted string here and will still be a
 * pre-formatted string when svc-ledger supplies it — the display layer never
 * sees a float, so it never gets the chance to round one.
 */
interface TreasuryStat {
  label: string;
  value: string;
  /** Signed percentage, display-only — it drives the up/down tone, not a total. */
  delta?: string;
  deltaLabel: string;
}

const treasury: TreasuryStat[] = [
  { label: copy.stats.volume, value: '$1,284,930,551.00', delta: '+6.20', deltaLabel: '+6.20% vs prior' },
  { label: copy.stats.settled, value: '$92,441,006.18', delta: '+1.94', deltaLabel: '+1.94% vs prior' },
  { label: copy.stats.openInterest, value: '$418,772,340.00', delta: '-0.63', deltaLabel: '-0.63% vs prior' },
  { label: copy.stats.latency, value: '0.84 ms', deltaLabel: 'p99 across venues' },
];

/** Mock lobbies — §8.3 capacity tiers, rendered by the shared primitive. */
const rooms = [
  {
    id: 'r1',
    title: 'Order Flow · Reading the Book',
    host: 'Operator 014',
    occupancy: 128,
    capacity: 200,
    live: true,
    access: 'free' as const,
  },
  {
    id: 'r2',
    title: 'Futures Risk · Liquidation Ladders',
    host: 'Operator 003',
    occupancy: 42,
    capacity: 50,
    live: true,
    access: 'staked' as const,
  },
  {
    id: 'r3',
    title: 'Sovereign Rails · Merchant Onboarding',
    host: 'Core Ops',
    occupancy: 17,
    capacity: null,
    live: false,
    access: 'invite' as const,
  },
  {
    id: 'r4',
    title: 'Identity Blueprint · Cohort 9',
    host: 'Neural Engine',
    occupancy: 88,
    capacity: 120,
    live: false,
    access: 'free' as const,
  },
] as const;

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <span className={styles.eyebrow}>{copy.eyebrow}</span>
        <h1 className={styles.wordmark}>{copy.wordmark}</h1>
        <p className={styles.lede}>{copy.lede}</p>

        <div className={styles.heroActions}>
          <Link href="/trade" className={styles.primary}>
            {copy.primaryCta}
          </Link>
          <a href="#rooms" className={styles.secondary}>
            {copy.secondaryCta}
          </a>
          <RankBadge rank={7} title={copy.rankTitle} tier="elite" />
        </div>
      </section>

      <div className={styles.split}>
        <Panel title={copy.panels.markets} live actions={<span className={styles.action}>{copy.actions.live}</span>}>
          <ul className={styles.tape}>
            {markets.map((market) => (
              <li key={market.symbol} className={styles.tapeRow}>
                <Ticker symbol={market.symbol} price={market.price} change={market.change} />
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={copy.panels.treasury}>
          <div className={styles.statGrid}>
            {treasury.map((stat) => (
              <StatBlock key={stat.label} label={stat.label} value={stat.value} delta={stat.delta} deltaLabel={stat.deltaLabel} />
            ))}
          </div>
        </Panel>
      </div>

      <section id="rooms" className={styles.rooms}>
        <Panel title={copy.panels.rooms} actions={<span className={styles.action}>{copy.actions.allRooms}</span>}>
          <div className={styles.roomGrid}>
            {rooms.map((room) => (
              <LobbyCard
                key={room.id}
                title={room.title}
                host={room.host}
                occupancy={room.occupancy}
                capacity={room.capacity}
                live={room.live}
                access={room.access}
              />
            ))}
          </div>
        </Panel>
      </section>

      <section className={styles.modules}>
        <h2 className={styles.sectionTitle}>{copy.modules.heading}</h2>
        <ul className={styles.moduleGrid}>
          {copy.modules.items.map((module) => (
            <li key={module.name} className={styles.module}>
              <span className={styles.moduleName}>{module.name}</span>
              <span className={styles.moduleDetail}>{module.detail}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
