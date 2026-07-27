import styles from './grid-backdrop.module.css';

/**
 * The ambience behind every surface: a phosphor bloom over a faint console
 * grid, on pure black. Purely decorative, so it is `aria-hidden` and fixed
 * behind the content — and it does not animate at all under reduced motion.
 */
export function GridBackdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.grid} />
      <div className={styles.bloom} />
      <div className={styles.scan} />
    </div>
  );
}
