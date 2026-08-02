import Link from 'next/link';
import { MarketPulse } from '@/components/landing/market-pulse';
import { SocketPanel } from '@/components/terminal/socket-panel';
import styles from './page.module.css';

/**
 * LANDING SHELL — the default page on :3000, and the first thing anyone sees.
 *
 * ── What was here ───────────────────────────────────────────────────────────
 *
 * Invented money, under a live badge. Five prices (`BTC/USDT 68,412.50` and
 * four more), four ledger figures (`$1,284,930,551.00` of 24h volume,
 * `$92,441,006.18` settled today, `$418,772,340.00` of open interest, a
 * `0.84 ms` match latency), four lobbies with hosts and occupancy counts, and a
 * rank-7 "elite Operator" badge shown to every anonymous visitor. The panel
 * header said "Streaming" and the section carried `data-live="true"`.
 *
 * The file said so, at the top: "Every value below is mock." That sentence is a
 * comment. It is stripped by the compiler. The words `mock`, `placeholder`,
 * `illustrative` and `not real` appeared zero times in the served HTML — the
 * honesty was addressed to the next engineer and never to the reader, which is
 * the only audience a landing page has.
 *
 * It was not a stale cache of something once true. `/api/v1/tickers` answers
 * for those exact symbols today and returns `last: null` for all sixteen listed
 * markets: nothing on this platform has ever traded. The repo's own rule —
 * `docs/FRONTEND-STATE-OF-TRUTH`, "Fake money / fixture seed: Forbidden" — was
 * being broken on the surface with the widest audience and the least code.
 *
 * ── What is here now ────────────────────────────────────────────────────────
 *
 * Three shapes, and no number chosen by this file:
 *
 *   · Market pulse — a real read of `/api/v1/tickers`. Today that renders
 *     sixteen symbols and "Not traded" against each. When a fill lands, a price
 *     appears here without anyone editing this file.
 *   · Ledger snapshot — a §13 socket. There is no aggregate-volume service to
 *     read, so the panel says that and names what would fill it.
 *   · Rooms — a §13 socket. svc-edge publishes no `/api/academy` prefix, so a
 *     browser cannot ask who is hosting or how full a lobby is.
 *
 * Nothing on this page claims to be live, because nothing on it is: the tickers
 * read is one request on mount and its header says "Snapshot".
 *
 * The structure survived the change intact, which was the original defence of
 * the mock and is now simply true: what landed was the feed, not a redesign.
 *
 * `page.test.tsx` renders this file and fails on any money-shaped literal in
 * the output. That test is the part that keeps this fixed.
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
  panels: {
    treasury: 'Ledger snapshot',
    rooms: 'Live rooms',
  },
  /**
   * Socket copy (§13). Each one names the missing service rather than the
   * missing number, because "no data" invites a reader to assume zero and
   * "svc-ledger publishes no aggregate" does not.
   */
  sockets: {
    treasury: {
      reason:
        'Traded volume, value settled and open interest are platform-wide aggregates. No service publishes them: the ledger answers per account, and nothing rolls those answers up. Until one does, this panel shows no figure rather than a figure nobody computed.',
      blockedBy: 'svc-ledger aggregate projection · market data',
    },
    rooms: {
      reason:
        'The lobby directory is not reachable from a browser. svc-edge publishes no academy prefix in its route table, so this page cannot ask which rooms exist, who is hosting one, or how many people are in it.',
      blockedBy: 'svc-edge route table · svc-academy',
    },
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

export default function LandingPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <span className={styles.eyebrow}>{copy.eyebrow}</span>
        <h1 className={styles.wordmark}>{copy.wordmark}</h1>
        <p className={styles.lede}>{copy.lede}</p>

        {/*
         * No rank badge. It read "7 · Operator · elite" for everyone, including
         * an anonymous visitor who has no account — an invented user state, in
         * the same family as an invented price. A real rank needs a session,
         * and this page does not have one.
         */}
        <div className={styles.heroActions}>
          <Link href="/trade" className={styles.primary}>
            {copy.primaryCta}
          </Link>
          <a href="#rooms" className={styles.secondary}>
            {copy.secondaryCta}
          </a>
        </div>
      </section>

      <div className={styles.split}>
        <MarketPulse />

        <SocketPanel title={copy.panels.treasury} reason={copy.sockets.treasury.reason} blockedBy={copy.sockets.treasury.blockedBy} />
      </div>

      <section id="rooms" className={styles.rooms}>
        <SocketPanel title={copy.panels.rooms} reason={copy.sockets.rooms.reason} blockedBy={copy.sockets.rooms.blockedBy} />
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
