'use client';

import { PLANES } from '@/lib/plane';
import { usePlane } from '@/lib/providers';
import styles from './terminal.module.css';

/**
 * THE PLANE SWITCH — §22, made into a control.
 *
 * "Zero-KYC follows custody. Everywhere. Without exception." The switch is
 * therefore not a view toggle: it is the choice of who holds the asset, and the
 * UI says so at the moment of choosing rather than in a settings page.
 *
 * ── Why the custody line is inside the control ─────────────────────────────
 *
 * A user must never be unclear about whether the platform is holding their
 * funds. If that statement lives anywhere other than the thing they click, it
 * can be scrolled past. So each option carries its own custody sentence, read
 * from `MODULES` (see `lib/plane.ts`) — and the two options are styled
 * differently on purpose: the sovereign one wears the accent, the custodial one
 * does not. They must never look interchangeable.
 */

const copy = {
  legend: 'Trading plane',
  custodial: 'Platform-held',
  sovereign: 'Self-custody',
} as const;

export function PlaneSwitch() {
  const { plane, setPlane } = usePlane();

  return (
    <div className={styles.planeSwitch} role="radiogroup" aria-label={copy.legend}>
      {PLANES.map((option) => {
        const active = option.id === plane.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={styles.planeOption}
            data-custodial={option.custodial}
            data-active={active}
            onClick={() => setPlane(option.id)}
          >
            <span className={styles.planeVenue}>{option.venue}</span>
            <span className={styles.planeTitle}>{option.title}</span>
            <span className={styles.planeCustody}>{option.custodial ? copy.custodial : copy.sovereign}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The band under the switch. Always visible, never dismissible.
 *
 * It states custody in one sentence and what it costs to get in. The product
 * claim is that a user always knows which of the two they are standing on; a
 * claim that is only true when a panel happens to be open is not the claim.
 */
export function CustodyBanner() {
  const { plane } = usePlane();

  return (
    <aside className={styles.custodyBanner} data-custodial={plane.custodial} aria-live="polite">
      <span className={styles.custodyMark} aria-hidden="true" />
      <div className={styles.custodyText}>
        <p className={styles.custodyStatement}>{plane.custodyStatement}</p>
        <p className={styles.custodyAccess}>{plane.access}</p>
      </div>
    </aside>
  );
}
