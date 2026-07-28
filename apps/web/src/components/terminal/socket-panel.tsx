'use client';

import type { ReactNode } from 'react';
import { Panel } from '@intafaced/ui';
import { describeFailure, type Failure } from '@/lib/result';
import styles from './terminal.module.css';

/**
 * THE HONEST EMPTY STATE.
 *
 * Two shapes, and the difference between them is the difference between "this
 * is broken right now" and "this was never built":
 *
 *   · `<SocketPanel>` — §13. The interface exists, the implementation does not.
 *     It says what is missing and what would fill it, and it is drawn as an
 *     obvious hole in the console, not as a panel with nothing in it.
 *   · `<FailurePanel>` — a service that should have answered and did not.
 *
 * Neither of them ever renders a number. That is the whole rule of this app: a
 * price that is actually a constant is worse than a blank panel, because a
 * blank panel does not get traded on.
 */

/** Placeholder for the i18n system — same pattern as every other surface here. */
const copy = {
  badge: 'Not wired',
  waitingOn: 'Waiting on',
} as const;

export function SocketPanel({
  title,
  reason,
  blockedBy,
  children,
}: {
  title: string;
  reason: string;
  blockedBy: string;
  children?: ReactNode;
}) {
  return (
    <Panel title={title}>
      <div className={styles.socket} data-kind="socket">
        <span className={styles.socketBadge}>{copy.badge}</span>
        <p className={styles.socketReason}>{reason}</p>
        <p className={styles.socketBlocked}>
          <span className={styles.socketBlockedLabel}>{copy.waitingOn}</span> <span className="if-numeric">{blockedBy}</span>
        </p>
        {children}
      </div>
    </Panel>
  );
}

export function FailureNotice({ failure }: { failure: Failure }) {
  return (
    <div className={styles.socket} data-kind="failure">
      <span className={styles.socketBadge} data-kind="failure">
        {failure.reason}
      </span>
      <p className={styles.socketReason}>{describeFailure(failure)}</p>
      <p className={styles.socketBlocked}>
        <span className="if-numeric">
          svc-{failure.service} · {failure.path}
        </span>
      </p>
    </div>
  );
}

export function GatedNotice({ reason }: { reason: string }) {
  return (
    <div className={styles.socket} data-kind="gated">
      <p className={styles.socketReason}>{reason}</p>
    </div>
  );
}

export function LoadingNotice({ label }: { label: string }) {
  return (
    <div className={styles.socket} data-kind="loading">
      <p className={styles.socketReason}>{label}</p>
    </div>
  );
}
