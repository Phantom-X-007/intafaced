import type { ReactNode } from 'react';
import Link from 'next/link';
import styles from './app-shell.module.css';
import { GridBackdrop } from './grid-backdrop';
import { PlatformStatus } from './platform-status';

/**
 * The chrome every surface sits inside: masthead, module nav, status rail.
 *
 * Lives here rather than in packages/ui because it is app navigation, not a
 * design-system primitive — apps/admin will want a different masthead. If a
 * second app ever needs this exact one, that is the moment it moves.
 */

/** Placeholder for the i18n system being built in a separate worktree. */
const copy = {
  wordmark: 'INTAFACED',
  skipToContent: 'Skip to content',
  nav: [
    { href: '/', label: 'Overview' },
    { href: '/trade', label: 'Trade' },
  ],
  footprint: 'Sovereign OS · Phase 2',
} as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <GridBackdrop />

      <a className={styles.skip} href="#main">
        {copy.skipToContent}
      </a>

      <header className={styles.masthead}>
        <Link href="/" className={styles.brand}>
          <span className={styles.mark} aria-hidden="true" />
          <span className={styles.wordmark}>{copy.wordmark}</span>
        </Link>

        <nav className={styles.nav} aria-label="Modules">
          {copy.nav.map((item) => (
            <Link key={item.href} href={item.href} className={styles.navLink}>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Measured, not asserted — see platform-status.tsx. */}
        <PlatformStatus />
      </header>

      <main id="main" className={styles.main}>
        {children}
      </main>

      <footer className={styles.footer}>
        <span>{copy.footprint}</span>
      </footer>
    </div>
  );
}
