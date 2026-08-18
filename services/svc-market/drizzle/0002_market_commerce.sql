-- svc-market · market.commerce Stage 1–2 — LISTINGS + ONE-TIME PURCHASES (§8.7)
-- Reversal: 0002_market_commerce.down.sql
--
-- Listings are metadata. Value moves only through packages/ledger-client
-- `marketPurchase` into svc-ledger. There is NO balance column, NO cached
-- amount, NO is_listed flag (eligibility is computed on vendors — Stage 3).
--
-- Every statement is idempotent: this file is re-runnable.

-- ── listings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "market"."listings" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "vendor_id"    uuid NOT NULL REFERENCES "market"."vendors"("id"),
  "title"        text NOT NULL
    CONSTRAINT "listings_title_not_blank" CHECK (length(btrim("title")) > 0 AND length("title") <= 120),
  "description"  text NOT NULL
    CONSTRAINT "listings_description_not_blank" CHECK (length(btrim("description")) > 0 AND length("description") <= 4000),
  -- one_time | subscription — subscription purchase path is residual (Stage 3).
  "offer_type"   text NOT NULL
    CONSTRAINT "listings_offer_type_ck" CHECK ("offer_type" IN ('one_time', 'subscription')),
  "asset_id"     text NOT NULL
    CONSTRAINT "listings_asset_not_blank" CHECK (length(btrim("asset_id")) > 0 AND length("asset_id") <= 32),
  -- Decimal string on the wire; stored as numeric(38,18) like every other money
  -- column in the monorepo. Never a floating `number`.
  "price"        numeric(38, 18) NOT NULL
    CONSTRAINT "listings_price_positive" CHECK ("price" > 0),
  -- active | archived. Suspended vendor cannot CREATE; purchase re-checks live
  -- listingEligibility rather than trusting this flag alone.
  "status"       text NOT NULL DEFAULT 'active'
    CONSTRAINT "listings_status_ck" CHECK ("status" IN ('active', 'archived')),
  "created_at"   timestamptz NOT NULL DEFAULT now(),
  "updated_at"   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "listings_vendor_idx"
  ON "market"."listings" ("vendor_id");

CREATE INDEX IF NOT EXISTS "listings_active_idx"
  ON "market"."listings" ("status") WHERE "status" = 'active';

-- ── purchases ───────────────────────────────────────────────────────────────
-- One row per client-supplied purchaseId. Idempotent: retry of the same
-- purchaseId with the same terms returns the same row; conflicting terms refuse.
CREATE TABLE IF NOT EXISTS "market"."purchases" (
  "id"              uuid PRIMARY KEY, -- client-supplied purchaseId
  "listing_id"      uuid NOT NULL REFERENCES "market"."listings"("id"),
  "buyer_id"        uuid NOT NULL,
  "vendor_id"       uuid NOT NULL REFERENCES "market"."vendors"("id"),
  "vendor_user_id"  uuid NOT NULL,
  "asset_id"        text NOT NULL,
  "price"           numeric(38, 18) NOT NULL
    CONSTRAINT "purchases_price_positive" CHECK ("price" > 0),
  "commission_bps"  integer NOT NULL
    CONSTRAINT "purchases_commission_bps_ck" CHECK ("commission_bps" >= 0 AND "commission_bps" <= 9999),
  -- pending | settled | rejected
  "status"          text NOT NULL DEFAULT 'pending'
    CONSTRAINT "purchases_status_ck" CHECK ("status" IN ('pending', 'settled', 'rejected')),
  "ledger_tx_id"    uuid,
  "rejection_code"  text,
  "created_at"      timestamptz NOT NULL DEFAULT now(),
  "settled_at"      timestamptz,
  CONSTRAINT "purchases_settled_has_tx_ck" CHECK (
    ("status" <> 'settled') OR ("ledger_tx_id" IS NOT NULL AND "settled_at" IS NOT NULL)
  ),
  CONSTRAINT "purchases_rejected_has_code_ck" CHECK (
    ("status" <> 'rejected') OR ("rejection_code" IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS "purchases_buyer_idx"
  ON "market"."purchases" ("buyer_id");

CREATE INDEX IF NOT EXISTS "purchases_listing_idx"
  ON "market"."purchases" ("listing_id");
