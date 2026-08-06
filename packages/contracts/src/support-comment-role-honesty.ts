/**
 * Contracts L3 — pure support comment author-role catalog honesty.
 *
 * Mirrors support.ts SupportComment.authorRole: user | operator.
 * No money / no refund invent.
 */

export const SUPPORT_COMMENT_ROLES = ['user', 'operator'] as const;
export type SupportCommentRoleId = (typeof SUPPORT_COMMENT_ROLES)[number];

/** L3 — catalog board. */
export function supportCommentRoleCatalogBoardCard(): {
  readonly roles: number;
  readonly hasUser: number;
  readonly hasOperator: number;
} {
  return {
    roles: SUPPORT_COMMENT_ROLES.length,
    hasUser: SUPPORT_COMMENT_ROLES.includes('user') ? 1 : 0,
    hasOperator: SUPPORT_COMMENT_ROLES.includes('operator') ? 1 : 0,
  };
}

/** L3 — status line. */
export function supportCommentRoleCatalogStatusLine(): string {
  const c = supportCommentRoleCatalogBoardCard();
  return `roles=${c.roles} user=${c.hasUser} operator=${c.hasOperator}`;
}

/** L3 — parse status. */
export function parseSupportCommentRoleCatalogStatusLine(line: string): {
  readonly roles: number;
  readonly user: number;
  readonly operator: number;
} | null {
  const m = line.trim().match(/^roles=(\d+) user=([01]) operator=([01])$/);
  if (!m) return null;
  return {
    roles: Number(m[1]),
    user: Number(m[2]),
    operator: Number(m[3]),
  };
}

/** L3 — true when status matches. */
export function supportCommentRoleCatalogStatusLineMatches(): boolean {
  const p = parseSupportCommentRoleCatalogStatusLine(supportCommentRoleCatalogStatusLine());
  if (!p) return false;
  const c = supportCommentRoleCatalogBoardCard();
  return p.roles === c.roles && p.user === c.hasUser && p.operator === c.hasOperator;
}

/** L3 — two roles. */
export function supportCommentRoleCatalogStatusLineConsistent(line: string): boolean {
  const p = parseSupportCommentRoleCatalogStatusLine(line);
  if (!p) return false;
  return p.roles === 2 && p.user === 1 && p.operator === 1;
}

/** L3 — export header. */
export function supportCommentRoleCatalogExportHeader(): string {
  return 'role';
}

/** L3 — export lines. */
export function supportCommentRoleCatalogExportLines(): readonly string[] {
  return [...SUPPORT_COMMENT_ROLES];
}

/** L3 — full export. */
export function supportCommentRoleCatalogExportText(): string {
  return [supportCommentRoleCatalogExportHeader(), ...supportCommentRoleCatalogExportLines()].join('\n');
}

/** L3 — role declared. */
export function isDeclaredSupportCommentRole(role: string): boolean {
  return (SUPPORT_COMMENT_ROLES as readonly string[]).includes(role);
}
