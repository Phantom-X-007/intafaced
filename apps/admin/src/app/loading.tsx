import { RouteBoundary } from '@/components/route-boundary';

/**
 * Suspense fallback for the page slot. The shell is already on screen.
 * Loading is not an empty queue and not a successful zero-row answer.
 */
export default function Loading() {
  return <RouteBoundary kind="loading" />;
}
