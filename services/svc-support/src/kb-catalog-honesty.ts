/**
 * Support L3 — pure KB catalog honesty boards (no i18n I/O).
 *
 * Structural counts on spine articles. Does not invent articles or vendor keys.
 */

export type KbArticleBoardInput = {
  readonly id: string;
  readonly titleKey: string;
  readonly bodyKey: string;
};

/** L3 — board card. */
export function kbCatalogBoardCard(articles: readonly KbArticleBoardInput[]): {
  readonly articles: number;
  readonly supportKbPrefix: number;
  readonly uniqueIds: number;
} {
  const ids = new Set(articles.map((a) => a.id));
  let supportKbPrefix = 0;
  for (const a of articles) {
    if (a.titleKey.startsWith('support.kb.') && a.bodyKey.startsWith('support.kb.')) {
      supportKbPrefix += 1;
    }
  }
  return {
    articles: articles.length,
    supportKbPrefix,
    uniqueIds: ids.size,
  };
}

/** L3 — status line. */
export function kbCatalogStatusLine(articles: readonly KbArticleBoardInput[]): string {
  const c = kbCatalogBoardCard(articles);
  return `articles=${c.articles} support_kb_prefix=${c.supportKbPrefix} unique_ids=${c.uniqueIds}`;
}

/** L3 — parse status. */
export function parseKbCatalogStatusLine(line: string): {
  readonly articles: number;
  readonly supportKbPrefix: number;
  readonly uniqueIds: number;
} | null {
  const m = line.trim().match(/^articles=(\d+) support_kb_prefix=(\d+) unique_ids=(\d+)$/);
  if (!m) return null;
  return {
    articles: Number(m[1]),
    supportKbPrefix: Number(m[2]),
    uniqueIds: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function kbCatalogStatusLineMatches(articles: readonly KbArticleBoardInput[]): boolean {
  const p = parseKbCatalogStatusLine(kbCatalogStatusLine(articles));
  if (!p) return false;
  const c = kbCatalogBoardCard(articles);
  return p.articles === c.articles && p.supportKbPrefix === c.supportKbPrefix && p.uniqueIds === c.uniqueIds;
}

/** L3 — unique ≤ articles; prefix ≤ articles. */
export function kbCatalogStatusLineConsistent(line: string): boolean {
  const p = parseKbCatalogStatusLine(line);
  if (!p) return false;
  return p.uniqueIds <= p.articles && p.supportKbPrefix <= p.articles;
}

/** L3 — export header. */
export function kbCatalogExportHeader(): string {
  return 'articles,support_kb_prefix,unique_ids';
}

/** L3 — export line. */
export function kbCatalogExportLine(articles: readonly KbArticleBoardInput[]): string {
  const c = kbCatalogBoardCard(articles);
  return `${c.articles},${c.supportKbPrefix},${c.uniqueIds}`;
}

/** L3 — full export. */
export function kbCatalogExportText(articles: readonly KbArticleBoardInput[]): string {
  return [kbCatalogExportHeader(), kbCatalogExportLine(articles)].join('\n');
}

/** L3 — has article id. */
export function kbCatalogHasId(articles: readonly KbArticleBoardInput[], id: string): boolean {
  return articles.some((a) => a.id === id);
}

/** L3 — count in range. */
export function kbArticleCountInRange(articles: readonly KbArticleBoardInput[], min: number, max: number): boolean {
  if (min > max) return false;
  const n = articles.length;
  return n >= min && n <= max;
}

/** L3 — all articles use support.kb. keys. */
export function kbCatalogAllSupportPrefixed(articles: readonly KbArticleBoardInput[]): boolean {
  if (articles.length === 0) return true;
  return kbCatalogBoardCard(articles).supportKbPrefix === articles.length;
}
