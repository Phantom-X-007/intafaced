import type { ReactNode } from 'react';
import styles from './data-table.module.css';

/**
 * A dense console table: uppercase display headers, tabular numerics, one row
 * height everywhere. Positions, open orders and fills are all the same shape,
 * so they are all this.
 *
 * Not a packages/ui primitive yet — it earns that once a second app needs it.
 *
 * Every value arrives pre-formatted. Nothing in here rounds, and nothing in
 * here takes a float: money is a string by the time it reaches a component.
 */

export type CellTone = 'neutral' | 'long' | 'short' | 'muted';

export interface DataTableColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** Renders in the packaged `.if-numeric` face. True for anything that ticks. */
  numeric?: boolean;
  /** Hidden below the narrow breakpoint — for columns that are context, not data. */
  secondary?: boolean;
}

export interface DataTableRow {
  id: string;
  cells: Record<string, ReactNode>;
  /** Per-cell tone override, keyed by column. */
  tones?: Record<string, CellTone>;
}

export interface DataTableProps {
  columns: DataTableColumn[];
  rows: DataTableRow[];
  /** Shown when there is nothing to display — an empty book is a state, not a bug. */
  emptyLabel?: string;
  caption?: string;
}

export function DataTable({ columns, rows, emptyLabel, caption }: DataTableProps) {
  if (rows.length === 0 && emptyLabel) {
    return <p className={styles.empty}>{emptyLabel}</p>;
  }

  return (
    <div className={styles.scroller}>
      <table className={styles.table}>
        {caption && <caption className={styles.caption}>{caption}</caption>}
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={styles.head}
                data-align={column.align ?? 'left'}
                data-secondary={column.secondary ? 'true' : undefined}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={styles.row}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.numeric ? `${styles.cell} if-numeric` : styles.cell}
                  data-align={column.align ?? 'left'}
                  data-tone={row.tones?.[column.key] ?? 'neutral'}
                  data-secondary={column.secondary ? 'true' : undefined}
                >
                  {row.cells[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
