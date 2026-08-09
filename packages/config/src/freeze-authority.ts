/**
 * FREEZE AUTHORITY HONESTY — admin kill residual (cannot invent freeze outside ledger).
 *
 * §4.2 / §14.6: the only platform-wide value freeze an operator can arm while
 * the platform runs is `ledger.posting` — `LEDGER_POSTING_ENABLED` at boot plus
 * the durable `posting_freeze` row via `/admin/ledger/freeze`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * Consoles and residual ops surfaces will keep inventing "freeze trade",
 * "freeze pay", "freeze everything" toggles that never write `posting_freeze`.
 * Those paint a halt the ledger does not honour — worse than no control.
 *
 * This module answers: "is this flag key a real freeze authority?" by reading
 * the flag registry, not by trusting a free-string label.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES NOT DO
 *
 * Does not freeze. Does not talk to the ledger. Does not invent a second money
 * freeze path. Money movement remains ledger-only via packages/ledger-client.
 */

import {
  FLAG_REGISTRY,
  enforcementOf,
  type FlagDef,
  type FlagEnforcement,
} from './flags.js';

/** The sole freeze-authority flag key in the registry. */
export const FREEZE_AUTHORITY_FLAG_KEY = 'ledger.posting' as const;

export type FreezeAuthorityCheck =
  | {
      readonly ok: true;
      readonly key: typeof FREEZE_AUTHORITY_FLAG_KEY;
      readonly enforcement: Extract<FlagEnforcement, { kind: 'operator-api' }>;
    }
  | {
      readonly ok: false;
      readonly key: string;
      readonly code: 'refuse.not_freeze_authority' | 'refuse.wrong_enforcement' | 'refuse.unknown_flag';
      readonly reason: string;
    };

/**
 * Every registry flag that is a live freeze authority.
 *
 * Today: exactly one — `ledger.posting` with operator-api enforcement on
 * svc-ledger. If a second ever appears, this list grows and tests re-derive.
 */
export function listFreezeAuthorities(): readonly FlagDef[] {
  return FLAG_REGISTRY.filter((f) => {
    if (f.key !== FREEZE_AUTHORITY_FLAG_KEY) return false;
    return f.enforcement.kind === 'operator-api';
  });
}

/**
 * Can `key` invent a platform freeze?
 *
 * Only `ledger.posting` with operator-api enforcement answers yes.
 * Everything else refuses — including kill-switch-adjacent NOT_ENFORCED rows
 * and service-env gates that stop a module but do not freeze the book.
 */
export function assertFreezeAuthority(key: string): FreezeAuthorityCheck {
  const trimmed = key.trim();
  if (trimmed === '') {
    return {
      ok: false,
      key,
      code: 'refuse.unknown_flag',
      reason: 'freeze authority: empty key — cannot invent a freeze path.',
    };
  }

  const enforcement = enforcementOf(trimmed);
  const known = FLAG_REGISTRY.some((f) => f.key === trimmed);

  if (!known) {
    return {
      ok: false,
      key: trimmed,
      code: 'refuse.unknown_flag',
      reason: `freeze authority: "${trimmed}" is not in FLAG_REGISTRY — refuse invent freeze outside the map.`,
    };
  }

  if (trimmed !== FREEZE_AUTHORITY_FLAG_KEY) {
    return {
      ok: false,
      key: trimmed,
      code: 'refuse.not_freeze_authority',
      reason:
        `freeze authority: "${trimmed}" is not the ledger freeze path. ` +
        `Only "${FREEZE_AUTHORITY_FLAG_KEY}" freezes value movement platform-wide. ` +
        `Module kill-switches and service-env gates are not freezes of the book.`,
    };
  }

  if (enforcement.kind !== 'operator-api') {
    return {
      ok: false,
      key: trimmed,
      code: 'refuse.wrong_enforcement',
      reason:
        `freeze authority: "${trimmed}" must be operator-api (live freeze surface). ` +
        `Got kind=${enforcement.kind}.`,
    };
  }

  return {
    ok: true,
    key: FREEZE_AUTHORITY_FLAG_KEY,
    enforcement,
  };
}

/**
 * Invent a freeze for an arbitrary surface label — always refuses unless the
 * label resolves to the sole freeze authority. Hostile path for consoles that
 * pass free text ("trade freeze", "pay freeze").
 */
export function inventFreezeOutsideLedger(label: string): FreezeAuthorityCheck {
  // Normalise common invent shapes to keys when they already are keys; free
  // prose never matches ledger.posting and refuses.
  const asKey = label.trim();
  return assertFreezeAuthority(asKey);
}

/** Operator-facing one-liner for the sole freeze surface. */
export function freezeAuthorityNote(): string {
  const check = assertFreezeAuthority(FREEZE_AUTHORITY_FLAG_KEY);
  if (!check.ok) {
    return 'freeze authority: MISCONFIGURED — ledger.posting is not a live operator freeze. Fix FLAG_REGISTRY.';
  }
  const e = check.enforcement;
  return (
    `freeze authority: ${FREEZE_AUTHORITY_FLAG_KEY} via ${e.envVar} on ${e.service}, ` +
    `live surface ${e.surface}. No other flag freezes the book.`
  );
}
