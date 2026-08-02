import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TerminalProviders } from '@/lib/providers';
import { describeMoneyShapes, findMoneyShapes } from '@/testing/fabricated-money';
import LandingPage from './page';

/**
 * THE LANDING PAGE, AS A BROWSER RECEIVES IT.
 *
 * The first component test in this app, and the reason it is the first one:
 * every other test here runs under `src/lib`, so nothing was watching what this
 * page actually rendered, and it shipped five invented prices and four invented
 * ledger totals under a "Streaming" badge. The source comment at the top of
 * `page.tsx` said "Every value below is mock" the entire time. Comments are not
 * served.
 *
 * `renderToStaticMarkup` is the point of the exercise: it produces the same
 * HTML string Next sends, so the assertions below are made against the artefact
 * that misled the visitor. What is checked is the DOM, never the source.
 *
 * The tree is wrapped in `TerminalProviders` because that is what `layout.tsx`
 * does — `MarketPulse` reads the edge client from context, and a test that
 * stubbed the context would be testing a page this app never serves.
 *
 * ── The known limit, stated so it is not mistaken for coverage ──────────────
 *
 * `renderToStaticMarkup` does not run effects, so `MarketPulse` appears here in
 * its first-render state (`loading`). Its other three states are asserted
 * directly in `components/landing/market-pulse.test.tsx`, which renders the
 * pure view with each state handed to it. Between the two files every branch
 * that can put a character on this page is scanned.
 */

function renderLanding(): string {
  return renderToStaticMarkup(
    <TerminalProviders edgeUrl="http://edge.test" depthUrl="http://ws.test">
      <LandingPage />
    </TerminalProviders>,
  );
}

describe('landing page — served HTML', () => {
  it('renders no money-shaped figure that no service supplied', () => {
    const hits = findMoneyShapes(renderLanding());
    expect(hits, hits.length ? describeMoneyShapes(hits) : undefined).toEqual([]);
  });

  /**
   * The specific corpse, pinned.
   *
   * The pattern check above is the real rule and would catch all of these on
   * its own. This test is here because a regression is most likely to be a
   * revert, and a revert should fail with the actual strings in the message
   * rather than with "expected [] to equal [...]".
   */
  it('does not resurrect the figures that were invented here', () => {
    const html = renderLanding();
    const fabricated = [
      '68,412.50', // BTC/USDT — /api/v1/tickers says `last: null` for this market
      '3,284.10', // ETH/USDT
      '184.62', // SOL/USDT
      '4.1820', // IFC/USDT
      '2,391.44', // XAU/USDT
      '1,284,930,551', // "Volume · 24h"
      '92,441,006', // "Settled today"
      '418,772,340', // "Open interest"
      '0.84 ms', // "Match latency"
    ];

    for (const value of fabricated) {
      expect(html, `"${value}" is back on the landing page`).not.toContain(value);
    }
  });

  /**
   * A number nobody fetched is one lie; the badge that vouches for it is the
   * other. `data-live="true"` lights the accent bloom `<Panel>` uses for a
   * pushing socket, and "Streaming" says so in words. Neither may appear on a
   * page whose only data source is one REST read on mount.
   */
  it('claims nothing on this page is live, because nothing on it is', () => {
    const html = renderLanding();

    expect(html).not.toContain('data-live="true"');
    expect(html).not.toContain('Streaming');
    // A standalone "Live" text node — the LobbyCard status badge. Built at
    // runtime rather than written as a literal so `pnpm scan:i18n` does not
    // read the pattern as an unkeyed JSX string.
    expect(html).not.toMatch(new RegExp('>\\s*Live\\s*<'));
  });

  /** Invented user state, same family as an invented price. */
  it('does not award an anonymous visitor a rank', () => {
    const html = renderLanding();

    expect(html).not.toContain('if-rank');
    expect(html).not.toContain('Operator');
  });

  /**
   * The panels with no service behind them must say so in the DOM, not in a
   * comment. `data-kind="socket"` is the §13 hole and `Not wired` is its badge
   * — if either disappears, something has been filled in without a feed.
   */
  it('renders the panels with no service behind them as declared holes', () => {
    const html = renderLanding();

    expect(html).toContain('data-kind="socket"');
    expect(html).toContain('Not wired');
    expect(html).toContain('Ledger snapshot');
    expect(html).toContain('svc-ledger aggregate projection');
    expect(html).toContain('svc-edge route table · svc-academy');
  });

  /**
   * A page that renders nothing at all also passes every check above. This is
   * the counterweight: the shell, the route into the terminal and the module
   * list are all still there, so "honest" cannot be reached by deleting the
   * page.
   */
  it('still renders the shell it is supposed to render', () => {
    const html = renderLanding();

    expect(html).toContain('INTAFACED');
    expect(html).toContain('href="/trade"');
    expect(html).toContain('Market pulse');
    expect(html).toContain('Modules');
    expect(html).toContain('Blueprint');
  });
});
