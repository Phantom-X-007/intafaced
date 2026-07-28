import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Orbitron } from 'next/font/google';
import { color } from '@intafaced/ui';

/**
 * Token sheet first, app wiring second — globals.css redefines a few `--if-*`
 * properties (the font stacks) and must therefore load after tokens.css.
 */
import '@intafaced/ui/tokens.css';
import './globals.css';

import { AppShell } from '@/components/app-shell';
import { TerminalProviders } from '@/lib/providers';

/**
 * Where the edge is, resolved once and handed to the client tree.
 *
 * `NEXT_PUBLIC_` because the browser makes the calls: it is a public URL and
 * carries no secret. Read here rather than deep inside a component so there is
 * one place to look when a deployment is pointed at the wrong front door — and
 * so the fallback (svc-edge's dev port, `services/svc-edge/src/env.ts`) sits
 * next to it instead of being buried.
 */
const EDGE_URL = process.env.NEXT_PUBLIC_EDGE_URL ?? 'http://localhost:4000';

/**
 * Where the depth stream is — svc-ws, not svc-edge.
 *
 * A second public origin, because the edge proxy buffers with `response.text()`
 * and cannot carry a socket (`services/svc-edge/README.md`, "Not built yet").
 * svc-ws holds no database, no bus and no service secret, so pointing a browser
 * straight at it opens a door onto public prices and nothing else — the trade
 * is argued in `services/svc-ws/README.md`.
 *
 * Resolved here, next to the edge URL, so there is exactly ONE place a
 * deployment is pointed at a front door. `lib/market/depth-source.ts` takes it
 * as an argument and reads no environment of its own; if it did, any component
 * could point the order book at a host whose provenance the app cannot state.
 *
 * Unset means the book renders as unavailable with that reason on screen — not
 * as a plausible ladder of numbers.
 */
const DEPTH_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:4014';

/**
 * §3 typography: Orbitron for display/HUD, Inter for body, JetBrains Mono for
 * every numeric surface. Loaded as CSS variables rather than class names so the
 * design tokens stay the single place a font is chosen.
 */
const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--if-font-orbitron',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--if-font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--if-font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'INTAFACED',
    template: '%s · INTAFACED',
  },
  description: 'The sovereign operating system for markets, money and identity.',
  applicationName: 'INTAFACED',
};

export const viewport: Viewport = {
  /**
   * Dark only. §3 specifies pure black as the ground the whole surface
   * treatment depends on; there is no light mode to negotiate with.
   */
  colorScheme: 'dark',
  /* Read from the token, never retyped — §3 keeps the hex in exactly one file. */
  themeColor: color.base,
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${orbitron.variable} ${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <TerminalProviders edgeUrl={EDGE_URL} depthUrl={DEPTH_URL}>
          <AppShell>{children}</AppShell>
        </TerminalProviders>
      </body>
    </html>
  );
}
