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
 * Shared short body for Stage-2 platform-native expansion.
 * Not a licensed third-party library import — residual title counts still apply.
 */
function seedBody(title: string, bullets: string[]): string {
  return ['# ' + title, '', ...bullets.map((b) => '- ' + b), '', 'No money moves in this item. No partner brand names.'].join('\n');
}

/**
 * Day-one spine + Stage-2 platform-native expansion (TRK-academy.curriculum).
 * Title promise (20 playbooks + 3 workbooks) remains residual when counts lag.
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
  // ── Stage-2 platform-native expansion (not licensed library invent) ───────
  {
    slug: 'foundations-position-sizing',
    title: 'Position sizing without invent',
    kind: 'playbook',
    path: 'foundations',
    order: 20,
    summary: 'Size from invalidation distance and account risk — never from a green candle.',
    body: seedBody('Position sizing without invent', [
      'Write the invalidation first; size is a consequence of distance and risk budget.',
      'If you cannot name the loss if wrong, do not place the order.',
      'Paper first when the paper market flag is on.',
    ]),
  },
  {
    slug: 'foundations-journal-discipline',
    title: 'Trade journal discipline',
    kind: 'playbook',
    path: 'foundations',
    order: 25,
    summary: 'What you write before and after a trade so the next one is not amnesia.',
    body: seedBody('Trade journal discipline', [
      'Thesis, invalidation, size, and why this time — before the order.',
      'After: what the book did, not what you hoped it would do.',
      'No retroactive thesis edits that invent skill.',
    ]),
  },
  {
    slug: 'markets-spread-and-slippage',
    title: 'Spread and slippage honesty',
    kind: 'playbook',
    path: 'markets',
    order: 20,
    summary: 'When the book is thin, the fill is not the mid you stared at.',
    body: seedBody('Spread and slippage honesty', [
      'Mid is not a promise; the next tradeable level is.',
      'Market orders pay for urgency — name the urgency or use a limit.',
      'Empty books are a true state, not a UI failure.',
    ]),
  },
  {
    slug: 'markets-session-structure',
    title: 'Session structure',
    kind: 'playbook',
    path: 'markets',
    order: 25,
    summary: 'Open, mid, and close behaviours without inventing a regime label.',
    body: seedBody('Session structure', [
      'Liquidity and noise change by session — observe before you name a pattern.',
      'Do not paste a vendor calendar as if it were platform law.',
    ]),
  },
  {
    slug: 'builder-kill-switch-drill',
    title: 'Kill-switch drill',
    kind: 'playbook',
    path: 'builder',
    order: 20,
    summary: 'Prove you can stop a run from a surface you control.',
    body: seedBody('Kill-switch drill', [
      'Name the button or command that stops the strategy before you start it.',
      'Paper run that stop once on purpose; a stop never tested is decoration.',
    ]),
  },
  {
    slug: 'builder-logs-not-vibes',
    title: 'Logs not vibes',
    kind: 'playbook',
    path: 'builder',
    order: 25,
    summary: 'What an automation must record so a human can audit it later.',
    body: seedBody('Logs not vibes', [
      'Every decision needs a timestamp, inputs, and the rule that fired.',
      'Missing logs are not privacy — they are unprovable behaviour.',
    ]),
  },
  {
    slug: 'sovereign-rail-map',
    title: 'Rail map',
    kind: 'playbook',
    path: 'sovereign',
    order: 20,
    summary: 'Custodial ledger vs self-custody rails — ask who holds the keys.',
    body: seedBody('Rail map', [
      'For each balance: house custody under the ledger, or a wallet you control?',
      'If the process dies, whose money is stranded and how does it return?',
    ]),
  },
  {
    slug: 'sovereign-withdrawal-hygiene',
    title: 'Withdrawal hygiene',
    kind: 'playbook',
    path: 'sovereign',
    order: 25,
    summary: 'Address check, small test send, no urgency theatre.',
    body: seedBody('Withdrawal hygiene', [
      'Verify the address offline; urgency is how people send to the wrong rail.',
      'Test size first when the rail is new to you.',
    ]),
  },
  {
    slug: 'markets-tape-reading-workbook',
    title: 'Tape reading (outline workbook)',
    kind: 'workbook',
    path: 'markets',
    order: 30,
    summary: 'Outline drills for reading public prints without inventing volume.',
    body: seedBody('Tape reading (outline workbook)', [
      'Drill: mark aggressor side only when the print carries it.',
      'Drill: empty tape is empty — do not paint green for silence.',
      'Fills stay paper until the paper market path is on.',
    ]),
  },
  {
    slug: 'builder-automation-workbook',
    title: 'Automation checklist (outline workbook)',
    kind: 'workbook',
    path: 'builder',
    order: 30,
    summary: 'Outline workbook for pre-flight of a paper automation.',
    body: seedBody('Automation checklist (outline workbook)', [
      'Kill-switch named and tested.',
      'Max loss and max size written before arming.',
      'No live keys in paper mode.',
    ]),
  },
  // ── Stage-2 L3 platform-native expansion toward title promise (not licensed invent) ──
  {
    slug: 'foundations-invalidation-first',
    title: 'Invalidation before entry',
    kind: 'playbook',
    path: 'foundations',
    order: 30,
    summary: 'Name the level that proves you wrong before you name the target.',
    body: seedBody('Invalidation before entry', [
      'If invalidation is vague, size is guesswork.',
      'Write it; size from distance; only then consider entry.',
      'Paper first when the paper market path is on.',
    ]),
  },
  {
    slug: 'foundations-fees-are-real',
    title: 'Fees are real cost',
    kind: 'playbook',
    path: 'foundations',
    order: 35,
    summary: 'Fee drag is not optional flavour — it is part of the edge math.',
    body: seedBody('Fees are real cost', [
      'Round-trip fees shrink the gap you need the market to give you.',
      'Do not invent a zero-fee world in the journal.',
      'Empty fee field is unknown, not free.',
    ]),
  },
  {
    slug: 'markets-order-types-honest',
    title: 'Order types without magic',
    kind: 'playbook',
    path: 'markets',
    order: 30,
    summary: 'Limit, market, and cancel behaviour without inventing fills.',
    body: seedBody('Order types without magic', [
      'A limit that never trades is not a failed UI — it is the book refusing your price.',
      'Cancel is a first-class action; practice it on paper.',
      'Never paint a working order as filled.',
    ]),
  },
  {
    slug: 'markets-correlation-caution',
    title: 'Correlation caution',
    kind: 'playbook',
    path: 'markets',
    order: 35,
    summary: 'Two books can move together without becoming one idea.',
    body: seedBody('Correlation caution', [
      'Stacking the same risk under different symbols is still one bet.',
      'If you cannot name the shared driver, you cannot size the stack.',
      'No invented hedge that the book does not prove.',
    ]),
  },
  {
    slug: 'builder-preflight-checklist',
    title: 'Automation preflight',
    kind: 'playbook',
    path: 'builder',
    order: 30,
    summary: 'What must be true before a paper automation is armed.',
    body: seedBody('Automation preflight', [
      'Kill-switch, max loss, max size, and paper-only gate — written before arm.',
      'If any line is missing, the run does not start.',
      'Live keys never ride along in paper mode.',
    ]),
  },
  {
    slug: 'builder-failure-modes',
    title: 'Failure modes of agents',
    kind: 'playbook',
    path: 'builder',
    order: 35,
    summary: 'How an agent fails closed when tools or data are dark.',
    body: seedBody('Failure modes of agents', [
      'Dark data plane → refuse invent quotes; say unavailable.',
      'Undeclared tool → refuse before dispatch.',
      'Silence is not success — log the refuse.',
    ]),
  },
  {
    slug: 'sovereign-custody-posture',
    title: 'Custody posture in one page',
    kind: 'playbook',
    path: 'sovereign',
    order: 20,
    summary: 'What the platform holds vs what never leaves your control surface.',
    body: seedBody('Custody posture in one page', [
      'Know which assets sit in platform custody and which never do.',
      'Withdraw paths are product law, not a chat promise.',
      'Support cannot invent balances.',
    ]),
  },
  {
    slug: 'sovereign-limits-and-tiers',
    title: 'Limits and verification tiers',
    kind: 'playbook',
    path: 'sovereign',
    order: 25,
    summary: 'Why a limit refuses — and why inventing a bypass is forbidden.',
    body: seedBody('Limits and verification tiers', [
      'A limit is a fail-closed gate, not a suggestion.',
      'Raising limits requires the verification path the product owns.',
      'No support chat can mint a higher limit without that path.',
    ]),
  },
  {
    slug: 'sovereign-incident-hygiene',
    title: 'Incident hygiene for operators',
    kind: 'playbook',
    path: 'sovereign',
    order: 30,
    summary: 'What to freeze, what to write, and what never to invent under load.',
    body: seedBody('Incident hygiene for operators', [
      'Freeze first when money path is unclear; invent never.',
      'Write both sides of a reconcile finding — not a single “fixed” claim.',
      'User-facing copy stays brand-clean under pressure.',
    ]),
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

/**
 * L3 — inventory of seeded spine only. Never invents DERIV//DESK residual titles.
 * Empty path → zero counts (honest emptiness, not a fabricated library).
 */
export type CurriculumInventory = {
  readonly total: number;
  readonly byPath: Readonly<Record<CurriculumPath, number>>;
  readonly byKind: Readonly<Record<CurriculumKind, number>>;
};

export function inventoryCurriculum(): CurriculumInventory {
  const byPath: Record<CurriculumPath, number> = {
    foundations: 0,
    markets: 0,
    builder: 0,
    sovereign: 0,
  };
  const byKind: Record<CurriculumKind, number> = {
    playbook: 0,
    workbook: 0,
    lesson: 0,
  };
  for (const item of SPINE) {
    byPath[item.path] += 1;
    byKind[item.kind] += 1;
  }
  return { total: SPINE.length, byPath, byKind };
}

/**
 * L3 — slug existence on spine only. Unknown → false (never invent residual titles).
 */
export function hasCurriculumSlug(slug: string): boolean {
  return BY_SLUG.has(slug.trim());
}

/**
 * L3 — sorted spine slugs only. Never invents residual library titles.
 */
export function listCurriculumSlugs(): readonly string[] {
  return [...BY_SLUG.keys()].sort();
}

/**
 * L3 — count items on one path. Unknown path key still returns 0 via filter.
 */
export function countCurriculumByPath(path: CurriculumPath): number {
  return SPINE.filter((item) => item.path === path).length;
}

/**
 * L3 — count items by kind on spine only. Never invent residual titles.
 */
export function countCurriculumByKind(kind: CurriculumKind): number {
  return SPINE.filter((item) => item.kind === kind).length;
}

/**
 * L3 — sorted slugs for one kind. Empty kind → [].
 */
export function listCurriculumSlugsByKind(kind: CurriculumKind): readonly string[] {
  return SPINE.filter((item) => item.kind === kind)
    .map((item) => item.slug)
    .sort();
}

/**
 * L3 — paths that have at least one spine item (sorted). Empty catalog → [].
 */
export function listPathsWithContent(): readonly CurriculumPath[] {
  const set = new Set<CurriculumPath>();
  for (const item of SPINE) set.add(item.path);
  return CURRICULUM_PATHS.filter((p) => set.has(p));
}
