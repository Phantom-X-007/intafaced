-- svc-market · vendor lifecycle Stage 2 — STAKE-GATED LISTING SLOTS (§8.7, `market.vendors`)
-- Reversal: 0001_market_vendor_slots.down.sql
--
-- ─────────────────────────────────────────────────────────────────────────────
-- STILL NO MONEY, AND STILL NO STAKE NUMBER.
--
-- There is no threshold column, no tier column and no slot-capacity column in
-- this file. Capacity is NOT stored: it is read from svc-token's
-- `/internal/stake/:userId` at claim time and again on every read, because a
-- capacity written into this schema is a second answer to "how many slots does
-- this vendor get" and the two diverge on the first tuning change
-- (docs/ops/trk/market.vendors.md:76, :156).
--
-- What IS stored is the only thing svc-token cannot know: which slots this
-- vendor has actually taken up.
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Every statement is idempotent: this file is re-runnable.

-- ── vendor_slots ─────────────────────────────────────────────────────────────
--
-- ONE ROW PER CLAIMED SLOT, released by setting `released_at` rather than by
-- deletion. Same shape as `academy.session_attendees` and for the same two
-- reasons: occupancy stays a COUNT over live rows rather than a maintained
-- counter that can drift, and a released slot leaves a trace of having existed.
--
-- WHY A SLOT TABLE AT ALL, rather than counting listings. There are no listings
-- — `market.commerce` is a different mountain and Stage 3 has not been built.
-- Deriving capacity from a table that does not exist would make the oversell
-- guarantee untestable, which is the one thing this stage is for. Stage 3
-- attaches a listing to a slot by writing its id into `ref`; nothing about that
-- later step changes this table.
CREATE TABLE IF NOT EXISTS "market"."vendor_slots" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "vendor_id"   uuid NOT NULL REFERENCES "market"."vendors"("id"),

  -- WHAT THE SLOT IS FOR, supplied by the caller.
  --
  -- This is what makes a claim IDEMPOTENT. Without it a retried request — a
  -- dropped connection, a double click, a client retry on a 500 that actually
  -- succeeded — consumes a second slot for the same thing, which is overselling
  -- capacity by a different route than the race this table's lock closes.
  -- Stage 3 sets it to a listing id; until then it is whatever the caller uses
  -- to name the listing it is about to create.
  "ref"         text NOT NULL CONSTRAINT "vendor_slots_ref_not_blank" CHECK (length(btrim("ref")) > 0 AND length("ref") <= 200),

  "claimed_at"  timestamptz NOT NULL DEFAULT now(),

  -- NULL means the slot is held. Set when the vendor releases it, and set for
  -- every open slot at once when an operator moves the vendor out of `approved`
  -- (vendor-service.ts `vet`).
  "released_at" timestamptz
);

-- ONE OPEN SLOT PER (vendor, ref) — a DATABASE fact, not a convention.
--
-- The claim path already serialises on the vendor row, so under normal operation
-- this index never fires. It is here for the path that does not take that lock:
-- a future internal tool, a backfill, a Stage 3 code path written by somebody
-- who has not read `claimSlot`. The lock is the mechanism; this is the proof.
-- PARTIAL, so re-claiming a ref that was released is allowed — releasing and
-- re-listing the same thing is ordinary vendor behaviour, not a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_slots_open_ref_idx"
  ON "market"."vendor_slots" ("vendor_id", "ref") WHERE "released_at" IS NULL;

-- The query the claim path runs under the lock, and the one every read runs:
-- how many slots does this vendor currently hold.
CREATE INDEX IF NOT EXISTS "vendor_slots_open_idx"
  ON "market"."vendor_slots" ("vendor_id") WHERE "released_at" IS NULL;
