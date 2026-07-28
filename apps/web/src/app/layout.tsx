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
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
