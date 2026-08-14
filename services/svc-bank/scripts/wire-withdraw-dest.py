#!/usr/bin/env python3
from pathlib import Path
ROOT = Path(".")

def patch(path: str, replacements: list[tuple[str, str]]) -> None:
    p = ROOT / path
    t = p.read_text()
    for old, new in replacements:
        if old not in t:
            raise SystemExit(f"missing needle in {path}: {old[:80]!r}")
        t = t.replace(old, new)
    p.write_text(t)
    print("patched", path)

patch("services/svc-bank/src/errors.ts", [
    (
        "  | 'bank.ramp_invalid_destination'\n  /** Same (rail, railRef)",
        "  | 'bank.ramp_invalid_destination'\n  /** Persisted dest missing — later withdraw has no real ref before withdrawHold. */\n  | 'bank.withdraw_destination_missing'\n  /** Same (rail, railRef)",
    )
])

schema = ROOT / "services/svc-bank/src/db/schema.ts"
t = schema.read_text()
t = t.replace(
    "import { boolean, date, index, integer, pgSchema, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';",
    "import { boolean, date, index, integer, pgSchema, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';",
)
insert = """
/**
 * Where a user is paid out on withdraw — kind+ref asserted (IBAN/IFSC/EVM)
 * before insert. One row per (user, kind). Loaded by offramp so withdrawHold
 * never runs against an invented dest.
 */
export const userWithdrawDestinations = bank.table(
  'user_withdraw_destinations',
  {
    userId: text('user_id').notNull(),
    kind: text('kind').notNull(),
    ref: text('ref').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ name: 'user_withdraw_destinations_pkey', columns: [t.userId, t.kind] })],
);

"""
needle = "// ── Auto-invest (§31:805 F-plane) ────────────────────────────────────────────"
if needle not in t:
    raise SystemExit("schema needle missing")
t = t.replace(needle, insert + needle)
t = t.replace(
    "  rampOnramps,\n  rampOfframps,\n  autoInvestRules,",
    "  rampOnramps,\n  rampOfframps,\n  userWithdrawDestinations,\n  autoInvestRules,",
)
schema.write_text(t)
print("patched schema")
print("partial-ok")
