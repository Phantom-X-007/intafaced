'use client';

import { RouteBoundary } from '@/components/route-boundary';

/**
 * App Router error boundary — sibling of `layout.tsx`, not a replacement.
 *
 * A throw in a page or nested layout replaces `{children}` only. The operator
 * shell (brand, nav, env strip, console-status banner) stays. That is the
 * isolation contract: a failing module must not take down the console.
 *
 * Copy is an error, never an empty-success queue. The thrown text stays off
 * the page — it can leak internals; the digest is the quoteable handle.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteBoundary kind="error" digest={error.digest} onRetry={reset} />;
}
