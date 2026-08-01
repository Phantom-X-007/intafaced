/**
 * ACADEMY CURRICULUM CATALOG (§8.3, §XIII "structured paths", "playbooks + workbooks").
 *
 * Pure content registry — no database, no money, no progress tracking.
 * Paths match Blueprint `curriculumPath` (packages/contracts blueprint.ts):
 * foundations | markets | builder | sovereign.
 *
 * ── Thin slice (A-P5-2) ─────────────────────────────────────────────────────
 *
 * This ships the READ surface: list the spine, open one item's body.
 * Progress, certifications, paper-trading workbooks, and XP are NOT here —
 * those need identity.rank and academy.certs.
 *
 * The day-one spine below is PLATFORM-NATIVE seed content so the API is real
 * rather than empty. The full proprietary DERIV//DESK library import
 * (20 playbooks + 3 workbooks named by the tracker) is residual: that library
 * is not in this monorepo. Do not invent those titles as if the import landed.
 *
 * User-facing copy uses platform brand vocabulary only (Doctrine §0.7).
 */

export type CurriculumPath = 'foundations' | 'markets' | 'builder' | 'sovereign';
export type CurriculumKind = 'playbook' | 'workbook' | 'lesson';

export interface CurriculumItemSummary {
  slug: string;
  title: string;
  kind: CurriculumKind;
  path: CurriculumPath;
  /** Stable sort order within a path (ascending). */
  order: number;
  summary: string;
}

export interface CurriculumItem extends CurriculumItemSummary {
  /** Markdown body. Lessons and playbooks carry content; workbooks may be outline-only until paper trading lands. */
  body: string;
}

/**
 * Day-one spine. One item per path is enough to prove the content path;
 * foundations carries a short playbook + lesson so list + detail both have
 * something non-trivial to return.
 */
const SPINE: readonly CurriculumItem[] = [
  {
    slug: 'foundations-risk-first',
    title: 'Risk first',
    kind: 'playbook',
    path: 'foundations',
    order: 10,
    summary: 'Position size, drawdown, and why capital preservation is the first skill.',
    body: [
      '# Risk first',
      '',
      'Every path in the Academy starts here. Before charts, before setups, before',
      'an agent is allowed near a live order — know what you can lose.',
      '',
      '## Position size',
      '',
      'Size from risk, not conviction. Pick the amount of capital you are willing',
      'to lose on the idea; work the size backward from the invalidation level.',
      '',
      '## Drawdown',
      '',
      'A daily loss prompt is a brake, not a challenge. Identity Blueprint guardrails',
      'seed a default; you may raise it, never ignore it quietly.',
      '',
      '## What this is not',
      '',
      'This playbook does not move money. Paper practice lands with the workbook',
      'flag on the trade service. Live size is your call, on your rails.',
    ].join('\n'),
  },
  {
    slug: 'foundations-order-types',
    title: 'Order types you will actually use',
    kind: 'lesson',
    path: 'foundations',
    order: 20,
    summary: 'Market, limit, and stop — plain language, no vendor names.',
    body: [
      '# Order types you will actually use',
      '',
      '## Market',
      '',
      'Fill now at whatever the book offers. Use when waiting costs more than the',
      'spread. Confirm before send if your guardrails say so.',
      '',
      '## Limit',
      '',
      'Fill only at your price or better. Use when the level matters more than speed.',
      '',
      '## Stop',
      '',
      'Exit (or enter) when price crosses a level you already chose. Write the level',
      'before you enter; rewriting it mid-trade is how small losses become large ones.',
    ].join('\n'),
  },
  {
    slug: 'markets-reading-the-book',
    title: 'Reading the book',
    kind: 'playbook',
    path: 'markets',
    order: 10,
    summary: 'Depth, spreads, and when a quote is not a promise.',
    body: [
      '# Reading the book',
      '',
      'A quote is a moment, not a guarantee. Thin books gap; wide spreads are a tax',
      'you pay whether you notice or not.',
      '',
      '## Depth',
      '',
      'Look past the top of book. A size that looks fine at the top can wipe the next',
      'three levels on a market order.',
      '',
      '## Venue choice',
      '',
      'Route on evidence — fees, depth, and settlement posture — not brand loyalty.',
      'When a venue cannot answer, the platform refuses rather than inventing a fill.',
    ].join('\n'),
  },
  {
    slug: 'builder-first-automation',
    title: 'First automation, no live capital',
    kind: 'playbook',
    path: 'builder',
    order: 10,
    summary: 'Agent guardrails and paper runs before any live rail.',
    body: [
      '# First automation, no live capital',
      '',
      'An agent without a kill-switch is not an agent you run. Start paper-only.',
      '',
      '## Guardrails',
      '',
      'Identity Blueprint writes default limits (leverage ceiling, daily loss prompt,',
      'confirm-before-market). Treat them as the starting posture, not a ceiling to',
      'race past on day one.',
      '',
      '## Kill-switch',
      '',
      'You must be able to stop the strategy from a surface you control. If you cannot',
      'name that surface, do not start the run.',
    ].join('\n'),
  },
  {
    slug: 'sovereign-self-custody-posture',
    title: 'Self-custody posture',
    kind: 'lesson',
    path: 'sovereign',
    order: 10,
    summary: 'What you hold, what the platform holds, and how to check which is which.',
    body: [
      '# Self-custody posture',
      '',
      'The platform is multi-rail. Some balances sit in house custody under the ledger;',
      'some never leave a wallet you control. Confusing the two is how people mis-size risk.',
      '',
      '## Ask one question',
      '',
      'If this process dies right now, whose money is stranded and how does it come back?',
      'If you cannot answer, do not move the size.',
      '',
      '## No partner names',
      '',
      'Your rails, your labels. Third-party brand names do not appear in Academy copy.',
    ].join('\n'),
  },
  {
    slug: 'foundations-paper-workbook',
    title: 'Paper practice (outline)',
    kind: 'workbook',
    path: 'foundations',
    order: 30,
    summary: 'Workbook shell for paper trading — body is outline until the paper market flag lands.',
    body: [
      '# Paper practice (outline)',
      '',
      'This workbook is the shell for simulated drills against a paper-trading market',
      'flag. The flag is owned by the trade service (`academy.paper-trading` on the',
      'tracker) and is not wired from this service.',
      '',
      '## Planned drills',
      '',
      '1. Size a risk-first entry from an invalidation level.',
      '2. Place a limit that does not fill; cancel cleanly.',
      '3. Hit a stop you wrote before entry.',
      '',
      '## What is missing on purpose',
      '',
      'No simulated fills here. No balances. No XP. Completing those needs the paper',
      'market and the certification path — both named elsewhere on the tracker.',
    ].join('\n'),
  },
] as const;

const BY_SLUG = new Map(SPINE.map((item) => [item.slug, item]));

export function listCurriculum(filter: { path?: CurriculumPath; kind?: CurriculumKind } = {}): CurriculumItemSummary[] {
  return SPINE.filter((item) => (filter.path ? item.path === filter.path : true) && (filter.kind ? item.kind === filter.kind : true))
    .slice()
    .sort((a, b) => (a.path === b.path ? a.order - b.order : a.path.localeCompare(b.path)))
    .map(({ body: _body, ...summary }) => summary);
}

export function getCurriculumItem(slug: string): CurriculumItem | null {
  return BY_SLUG.get(slug) ?? null;
}

/** Stable set of paths the catalog recognises — matches Blueprint curriculumPath. */
export const CURRICULUM_PATHS: readonly CurriculumPath[] = ['foundations', 'markets', 'builder', 'sovereign'];
