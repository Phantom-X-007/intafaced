'use client';

import { useCallback } from 'react';
import { serviceHealth } from '@/lib/api/services';
import { useEdge, useSession } from '@/lib/providers';
import { useService } from '@/lib/use-service';
import styles from './app-shell.module.css';

/**
 * THE STATUS RAIL — a measurement, not a slogan.
 *
 * It used to read "Systems nominal", unconditionally, with the entire fleet
 * down. That is the smallest possible version of the lie this app is built not
 * to tell, and it sits in the masthead of every page.
 *
 * What it does now is one call, `trade.health` through svc-edge, which proves
 * three separate things at once: the edge is up, `/api/trade` is routed, and
 * the upstream answered. Any of them failing is the same fact from a user's
 * point of view — nothing works — so one probe is the honest granularity.
 */

const copy = {
  checking: 'Checking…',
  reachable: 'Edge + svc-trade reachable',
  unreachable: 'Platform unreachable',
  guest: 'Guest session',
  signedIn: 'Signed in',
} as const;

export function PlatformStatus() {
  const edge = useEdge();
  const session = useSession();
  const call = useCallback(() => serviceHealth(edge, 'trade'), [edge]);
  const { state } = useService(call, 'status.trade');

  const tone = state.status === 'ok' ? 'up' : state.status === 'failed' ? 'down' : 'unknown';
  const label = state.status === 'ok' ? copy.reachable : state.status === 'failed' ? copy.unreachable : copy.checking;

  return (
    <div className={styles.status}>
      <span className={styles.pulse} data-tone={tone} aria-hidden="true" />
      <span>{label}</span>
      <span className={styles.divider} aria-hidden="true" />
      <span className={styles.session}>
        {session.status === 'authenticated' ? `${copy.signedIn} · ${session.tier ?? 'tier unknown'}` : copy.guest}
      </span>
    </div>
  );
}
