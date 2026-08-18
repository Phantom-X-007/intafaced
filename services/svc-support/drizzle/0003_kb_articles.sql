-- svc-support · versioned published KB (ops.kb-workflow Stage 1)
-- Reversal: 0003_kb_articles.down.sql
--
-- Extracts the day-one spine from a TypeScript constant into a versioned
-- published set. Public doors list/search/get only `published = true`.
--
-- NO BODY TEXT. The article is its i18n keys. A German copy edit must not
-- change a citation digest (`citeKbArticle` hashes keys, not rendered text).
--
-- NO AMOUNT / BALANCE / CURRENCY COLUMN. This table is a content surface.
-- A money column here would be a second book wearing a help-article name.

CREATE TABLE IF NOT EXISTS "support"."kb_articles" (
  "id"         text PRIMARY KEY,
  "title_key"  text NOT NULL,
  "body_key"   text NOT NULL,
  "revision"   integer NOT NULL,
  "published"  boolean NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE "support"."kb_articles" DROP CONSTRAINT IF EXISTS "kb_articles_revision_ck";
ALTER TABLE "support"."kb_articles" ADD CONSTRAINT "kb_articles_revision_ck"
  CHECK ("revision" >= 1);

ALTER TABLE "support"."kb_articles" DROP CONSTRAINT IF EXISTS "kb_articles_title_key_ck";
ALTER TABLE "support"."kb_articles" ADD CONSTRAINT "kb_articles_title_key_ck"
  CHECK ("title_key" LIKE 'support.kb.%');

ALTER TABLE "support"."kb_articles" DROP CONSTRAINT IF EXISTS "kb_articles_body_key_ck";
ALTER TABLE "support"."kb_articles" ADD CONSTRAINT "kb_articles_body_key_ck"
  CHECK ("body_key" LIKE 'support.kb.%');

CREATE INDEX IF NOT EXISTS "kb_articles_published_idx"
  ON "support"."kb_articles" ("id")
  WHERE "published" = true;

-- Seed the five PLATFORM_KB_SPINE rows as published r1 so public doors stay
-- non-empty after the catalog moves off the TypeScript constant.
INSERT INTO "support"."kb_articles" ("id", "title_key", "body_key", "revision", "published")
VALUES
  ('kb-account-access', 'support.kb.account_access.title', 'support.kb.account_access.body', 1, true),
  ('kb-security-basics', 'support.kb.security_basics.title', 'support.kb.security_basics.body', 1, true),
  ('kb-orders-status', 'support.kb.orders_status.title', 'support.kb.orders_status.body', 1, true),
  ('kb-deposit-withdraw-honest', 'support.kb.deposit_withdraw.title', 'support.kb.deposit_withdraw.body', 1, true),
  ('kb-paper-vs-live', 'support.kb.paper_vs_live.title', 'support.kb.paper_vs_live.body', 1, true)
ON CONFLICT ("id") DO NOTHING;
