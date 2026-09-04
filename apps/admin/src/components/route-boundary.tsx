'use client';

import { Chip, type ChipTone } from '@/components/chip';

/**
 * Route-level honesty for the operator console (§14 / §18.2 residual).
 *
 * Next's App Router special files (`error.tsx`, `not-found.tsx`, `loading.tsx`)
 * render this view in the `{children}` slot of `layout.tsx`. The top bar, nav
 * and status strip stay mounted: a failing or missing screen must not take
 * down the operator shell, and must not paint an empty users/orders/finance
 * table as if the queue were live and vacant.
 */
export type RouteBoundaryKind = 'loading' | 'not-found' | 'error';

export interface RouteBoundaryCopy {
  readonly kind: RouteBoundaryKind;
  readonly chip: string;
  readonly chipTone: ChipTone;
  readonly title: string;
  readonly lead: string;
  readonly body: string;
  readonly follow: string;
}

export const ROUTE_BOUNDARY_COPY: Record<RouteBoundaryKind, RouteBoundaryCopy> = {
  loading: {
    kind: 'loading',
    chip: 'loading',
    chipTone: 'info',
    title: 'Loading this operator screen',
    lead: 'Loading',
    body: 'The operator shell is up. This screen has not rendered yet. This is not a queue and not an empty result.',
    follow: 'Waiting for the screen. No rows are shown because none have been fetched.',
  },
  'not-found': {
    kind: 'not-found',
    chip: 'not found',
    chipTone: 'warn',
    title: 'This operator route does not exist',
    lead: 'Not found',
    body: 'Unknown path. This is not an empty users, orders, finance, or withdrawal queue. A missing route has no queue authority.',
    follow: 'Open a mounted operator screen from the bar. Do not approve, reject, or invent work from this page.',
  },
  error: {
    kind: 'error',
    chip: 'error',
    chipTone: 'danger',
    title: 'This screen failed to render',
    lead: 'Render error',
    body: 'This is an error, not an empty-success queue. Other operator screens in the shell still exist. No users, orders, finance, or withdrawal rows were invented.',
    follow: 'Retry this screen or open another mounted tool. Do not treat this as an empty work queue.',
  },
};

export interface RouteBoundaryProps {
  readonly kind: RouteBoundaryKind;
  readonly digest?: string;
  readonly onRetry?: () => void;
}

export function RouteBoundary({ kind, digest, onRetry }: RouteBoundaryProps) {
  const copy = ROUTE_BOUNDARY_COPY[kind];
  const tone = kind === 'error' ? 'danger' : kind === 'not-found' ? 'warn' : 'info';

  return (
    <section
      className="adm-stack"
      data-route-boundary={kind}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
      aria-busy={kind === 'loading'}
    >
      <div className="adm-pagehead">
        <div>
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>
        </div>
        <Chip tone={copy.chipTone} dot>
          {copy.chip}
        </Chip>
      </div>

      <div className="adm-callout" data-tone={tone}>
        <strong>{copy.lead}</strong>
        {copy.follow}
        {kind === 'error' && digest ? (
          <>
            {' '}
            Digest <code>{digest}</code>.
          </>
        ) : null}
      </div>

      {kind !== 'loading' && (
        <div className="adm-inline">
          <a className="adm-btn" href="/">
            Kill-switches
          </a>
          {onRetry ? (
            <button type="button" className="adm-btn" onClick={onRetry}>
              Retry this screen
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
}
