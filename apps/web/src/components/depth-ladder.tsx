import type { CSSProperties } from 'react';
import styles from './depth-ladder.module.css';

/**
 * The order book ladder — asks descending, spread, bids descending, with a
 * cumulative depth bar behind each row.
 *
 * This is the shape the `depth.<market>` ws-gateway stream (§5.3) will fill.
 * The component is deliberately dumb: it takes pre-formatted strings and a
 * 0–1 depth ratio, and does no arithmetic on prices or sizes at all.
 */

export interface DepthLevel {
  /** Pre-formatted to the market's tick size by whoever owns that precision. */
  price: string;
  /** Pre-formatted to the market's lot size. */
  size: string;
  /** Cumulative size, pre-formatted. */
  total: string;
  /** 0–1 share of the visible book, for the depth bar width. Display only. */
  depth: number;
}

export interface DepthLadderProps {
  asks: DepthLevel[];
  bids: DepthLevel[];
  /** Pre-formatted last traded price. */
  lastPrice: string;
  /** Pre-formatted spread, e.g. "0.50 (0.01%)". */
  spread: string;
  lastDirection?: 'up' | 'down' | 'flat';
  labels: { price: string; size: string; total: string; spread: string };
}

function depthStyle(depth: number): CSSProperties {
  /**
   * Clamped and rounded to whole percent — a bad ratio should look wrong, not
   * break the layout. This is a bar width, never a quantity: no value a user
   * could read as a number passes through arithmetic anywhere in this app.
   */
  const percent = Math.round(Math.min(Math.max(depth, 0), 1) * 100);
  return { '--depth': `${percent}%` } as CSSProperties;
}

function Side({ levels, side, labelledBy }: { levels: DepthLevel[]; side: 'ask' | 'bid'; labelledBy: string }) {
  return (
    <ol className={styles.side} data-side={side} aria-labelledby={labelledBy}>
      {levels.map((level) => (
        <li key={`${side}-${level.price}`} className={styles.level} style={depthStyle(level.depth)}>
          <span className={styles.bar} aria-hidden="true" />
          <span className={`${styles.price} if-numeric`}>{level.price}</span>
          <span className={`${styles.size} if-numeric`}>{level.size}</span>
          <span className={`${styles.total} if-numeric`}>{level.total}</span>
        </li>
      ))}
    </ol>
  );
}

export function DepthLadder({ asks, bids, lastPrice, spread, lastDirection = 'flat', labels }: DepthLadderProps) {
  return (
    <div className={styles.ladder}>
      <div className={styles.header} aria-hidden="true">
        <span>{labels.price}</span>
        <span>{labels.size}</span>
        <span>{labels.total}</span>
      </div>

      <span id="depth-asks" className={styles.srOnly}>
        {labels.price}
      </span>
      <Side levels={asks} side="ask" labelledBy="depth-asks" />

      <div className={styles.mid}>
        <span className={`${styles.last} if-numeric`} data-direction={lastDirection}>
          {lastPrice}
        </span>
        <span className={styles.spread}>
          {labels.spread} <span className="if-numeric">{spread}</span>
        </span>
      </div>

      <span id="depth-bids" className={styles.srOnly}>
        {labels.size}
      </span>
      <Side levels={bids} side="bid" labelledBy="depth-bids" />
    </div>
  );
}
