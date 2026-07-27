import { DROPS, FLAG_REGISTRY, type Drop, type FlagDef } from '@intafaced/config';

/**
 * §11 LAUNCH-SEQUENCE MAPPING — presentation layer only.
 *
 * `DROPS` and every flag's `drop` come from `@intafaced/config`; this file adds
 * nothing but the human names for the six phases, which the doctrine table has
 * and the code does not. See the README for why that is a gap in `flags.ts`
 * rather than something this app should own long-term.
 */
export const DROP_LABELS: Readonly<Record<Drop, string>> = {
  '0': 'Tease',
  I: 'Blueprint',
  II: 'Lobby preview',
  III: 'Soft launch',
  IV: 'Public drop',
  V: 'Seasons',
};

export function dropLabel(drop: Drop): string {
  return `${drop} · ${DROP_LABELS[drop]}`;
}

/** Flags that first switch on AT this drop (not cumulative). */
export function flagsTurnedOnAt(drop: Drop): FlagDef[] {
  return FLAG_REGISTRY.filter((f) => f.drop === drop);
}

/**
 * Flags with `drop === null` — never on by default, at any drop. These are the
 * §13 sockets and licence-gated surfaces; an operator turns them on explicitly
 * or they stay dark forever.
 */
export function offClockFlags(): FlagDef[] {
  return FLAG_REGISTRY.filter((f) => f.drop === null);
}

export function isDrop(value: string): value is Drop {
  return (DROPS as readonly string[]).includes(value);
}
