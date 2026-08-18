-- svc-support · immutable KB versions (ops.kb-workflow content surface)
-- Reversal: 0004_kb_article_versions.down.sql
--
-- Head row stays in kb_articles (one id, current published body).
-- Every published body is also appended here so getKb({ id, version }) can
-- read a prior version without silently substituting an older or newer body.
--
-- NO AMOUNT / BALANCE / CURRENCY COLUMN. Content surface only.

CREATE TABLE IF NOT EXISTS "support"."kb_article_versions" (
  "id"        text NOT NULL,
  "version"   integer NOT NULL,
  "title_key" text NOT NULL,
  "body_key"  text NOT NULL,
  PRIMARY KEY ("id", "version")
);

ALTER TABLE "support"."kb_article_versions" DROP CONSTRAINT IF EXISTS "kb_article_versions_version_ck";
ALTER TABLE "support"."kb_article_versions" ADD CONSTRAINT "kb_article_versions_version_ck"
  CHECK ("version" >= 1);

ALTER TABLE "support"."kb_article_versions" DROP CONSTRAINT IF EXISTS "kb_article_versions_title_key_ck";
ALTER TABLE "support"."kb_article_versions" ADD CONSTRAINT "kb_article_versions_title_key_ck"
  CHECK ("title_key" LIKE 'support.kb.%');

ALTER TABLE "support"."kb_article_versions" DROP CONSTRAINT IF EXISTS "kb_article_versions_body_key_ck";
ALTER TABLE "support"."kb_article_versions" ADD CONSTRAINT "kb_article_versions_body_key_ck"
  CHECK ("body_key" LIKE 'support.kb.%');

INSERT INTO "support"."kb_article_versions" ("id", "version", "title_key", "body_key")
SELECT "id", "revision", "title_key", "body_key"
FROM "support"."kb_articles"
ON CONFLICT ("id", "version") DO NOTHING;
