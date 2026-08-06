import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Inter, Orbitron } from 'next/font/google';
import { color } from '@intafaced/ui';
import '@intafaced/ui/tokens.css';
import './globals.css';
import { ConsoleStatusBanner } from '@/components/console-status-banner';
import { Nav } from '@/components/nav';
import { readConsoleStatus } from '@/lib/console-status';
import { dropLabel } from '@/lib/drops';
import { readOperatorEnv } from '@/lib/operator-env';

/**
 * Fonts are downloaded at build time and served from our own origin. §3 names
 * Orbitron and Inter; an operator console that fetches them from a third party
 * at runtime would leak every operator's IP to that third party for the sake of
 * a typeface. The CSS variables are consumed by globals.css.
 */
const orbitron = Orbitron({ subsets: ['latin'], display: 'swap', variable: '--adm-font-display' });
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--adm-font-body' });

export const metadata: Metadata = {
  title: 'INTAFACED · Operator Console',
  description: 'Kill-switches, launch sequence, jurisdiction matrix and ledger operations.',
  robots: { index: false, follow: false },
};

// `themeColor` is a browser-chrome value and cannot be a CSS variable, so it is
// read from the token module rather than written as a literal. Nothing in this
// app hardcodes a colour.
export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: color.base,
};

/**
 * Nothing in this console is cached or prerendered. The drop, the flag
 * overrides and the matrix are read on every request, because a stale
 * kill-switch board is worse than no board.
 */
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  const env = readOperatorEnv();
  const overrideCount = Object.keys(env.flagEnv).length;
  // Read here, not on one page: whether this console can halt anything is a
  // property of the deployment, and an operator must meet it on whichever screen
  // they happened to open. See `components/console-status-banner.tsx`.
  const consoleStatus = readConsoleStatus();

  return (
    <html lang="en" className={`${orbitron.variable} ${inter.variable}`}>
      <body>
        <div className="adm-shell">
          <header className="adm-topbar">
            <span className="adm-brand">
              INTAFACED
              <small>Operator Console</small>
            </span>

            <Nav />

            <span className="adm-topbar__spacer" />

            <span className="adm-envstrip">
              <span>
                DROP <b>{dropLabel(env.drop)}</b>
              </span>
              <span>
                ENV <b>{env.appEnv}</b>
              </span>
              <span>
                FLAG ENV OVERRIDES <b>{overrideCount}</b>
              </span>
            </span>
          </header>

          <ConsoleStatusBanner status={consoleStatus} />

          <main className="adm-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
