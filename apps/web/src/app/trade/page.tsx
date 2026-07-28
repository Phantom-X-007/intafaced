import type { Metadata } from 'next';
import { Terminal } from '@/components/terminal/terminal';

/**
 * PRO TERMINAL (§5.3), wired.
 *
 * This page is a server component that renders one client tree and nothing
 * else: everything on this surface is a live read, and there is no data here
 * worth prerendering. What replaced the mock is worth stating plainly —
 * previously every price, size and balance on this page was a string literal in
 * this file, including a full six-level order book. None of them are now. What
 * cannot be fetched is not drawn.
 */

export const metadata: Metadata = {
  title: 'Trade',
};

export default function TradePage() {
  return <Terminal />;
}
