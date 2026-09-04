import { RouteBoundary } from '@/components/route-boundary';

/**
 * Unknown operator path. Not an empty users/orders/finance/withdrawal table.
 * A missing route has no queue authority — it is not found.
 */
export default function NotFound() {
  return <RouteBoundary kind="not-found" />;
}
