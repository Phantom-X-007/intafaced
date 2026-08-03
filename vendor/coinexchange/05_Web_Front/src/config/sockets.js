/**
 * §13 SOCKETS FOR THE VENDORED SHELL — promotions, referrals, launchpad,
 * gifts and dividends.
 * ----------------------------------------------------------------------------
 *
 * WHY THIS FILE EXISTS.
 *
 * Ten screens in this shell were still calling the retired venue backend
 * (`/uc/promotion/*`, `/uc/activity/*`, `/uc/bonus/*`, `/uc/redenvelope/*`,
 * `/uc/miningorder/*`). nginx proxies exactly two prefixes — `/api/` to
 * svc-edge and `/ws` to svc-ws — so every one of those paths fell through to
 * `try_files ... /index.html` and came back as a 200 with an HTML body. The
 * screens then sat on a spinner or printed a generic failure. A reader cannot
 * tell that apart from a slow network, which is the worst possible outcome:
 * the platform looks broken rather than unfinished.
 *
 * Rewiring them was checked first and is not available. Every tRPC router
 * across all seventeen services was read, plus svc-edge's route table
 * (`services/svc-edge/src/routes.ts`, fifteen prefixes). There is no referral
 * tree, no promotion card, no gift claim, no cloud-mining contract, no
 * launchpad subscription and no user-scoped dividend read anywhere behind the
 * front door. You cannot point a screen at a procedure that does not exist.
 *
 * So each of these screens states its own gap instead. That is §13: the socket
 * is named, the missing piece is named, and nothing pretends.
 *
 * ── WHY THIS IS DATA AND NOT PROSE INSIDE EACH COMPONENT ────────────────────
 *
 * Same reason `MODULES` in intafaced.js is data: eight screens describing the
 * same absence in eight slightly different ways is how a system starts telling
 * a reader two stories. One row per screen, read by one component.
 *
 * ── WHAT `tracker` MEANS, AND WHY IT DECIDED SOCKET-VS-DELETE ───────────────
 *
 * `tracker` is the row id in `tooling/tracker/features.mjs` that plans this
 * capability, or null if no row plans it. It is not decoration — it is the
 * line that separates a screen we keep from a screen we delete:
 *
 *   a tracker row exists  → SOCKET. The platform intends to build this. Throwing
 *                           away finished UI for a planned product is exactly
 *                           the "rebuilt by accident" failure the adoption ADR
 *                           (docs/adr/2026-08-02-...) was written to stop.
 *   no tracker row + the
 *   screen promises money → DELETE. Nobody has said we want it, and an
 *                           unbuildable payout promise is not worth preserving.
 *
 * Two screens fell on the delete side; they are recorded in REMOVED below
 * rather than vanishing quietly.
 *
 * Money note: nothing in this file carries an amount, because none of these
 * screens has an amount to carry. That is the point of them.
 *
 * ── AMENDMENT 2026-08-03 · A SECOND KIND OF GAP ─────────────────────────────
 *
 * `token.rights` and `token.governance` were added by the svc-token honesty
 * pass, and they are not the same shape as the eight above. Those eight were
 * screens pointed at a retired backend: the capability was absent and the
 * screen went looking for it. The Bzb / "BZB ECO" page called nothing at all.
 * It was static marketing prose asserting rights — fixed supply, revenue share,
 * super nodes, governance weight, a development allocation — that no service
 * implements and no tracker row plans, and it rendered every one of them as
 * settled fact to any visitor who found the route.
 *
 * A screen that hangs on a dead path at least looks broken. A screen that
 * confidently states an entitlement the platform does not provide looks
 * finished, and is read as a promise. That is the worse failure, so it is
 * socketed on the same terms as the rest: what is missing, what would have to
 * be built, and which tracker row is accountable.
 *
 * `deadPath` is therefore "none" on both, rather than blank or invented. The
 * field means "what this screen used to call"; the honest answer here is that
 * it never called anything, and that is itself the finding.
 *
 * Both tracker rows were `done` when this was written and were corrected to
 * `socket` in the same pass — see tooling/tracker/features.mjs. A socket
 * pointing at a row that claims the thing already ships would be its own lie.
 *
 * ── AMENDMENT 2026-08-03 · A THIRD KIND OF GAP: THE ASSERTED ERROR ──────────
 *
 * `cms.announcements` was added for the landing announcement strip, and it fails
 * in a third way again. The eight original screens hung on a dead path. The two
 * token screens stated rights nobody implements. This one CLAIMS A FAILURE THAT
 * NEVER HAPPENED: the caller reads an HTML body as if it were the API envelope,
 * finds no `code`, and raises a red error toast whose body is `resp.message` —
 * a field that does not exist on an HTML string. The reader gets an error
 * notification with a title and nothing in it.
 *
 * That is worse than the spinner. A spinner says "still working". An empty error
 * toast asserts that something went wrong and then refuses to say what, which
 * reads as a fault in the platform the reader is looking at rather than a
 * capability nobody has built. The socket exists to replace an untrue error with
 * a true absence.
 */

/**
 * One row per socketed screen.
 *
 * @typedef {object} SocketEntry
 * @property {string} capability  What the screen is for, in one sentence.
 * @property {string} deadPath    The retired venue path it used to call.
 * @property {string|null} tracker Tracker row id planning this, or null.
 * @property {string[]} missing   What does not exist behind svc-edge today.
 * @property {string[]} needed    What would have to be built to turn this on.
 * @property {string} [strip]     Optional one-line form for a host with no room
 *                                for the panel (`IxNoSurface` inline). Omitted
 *                                on every row that has no such host.
 *
 * `strip` is the one place this file allows a second phrasing, and it is fenced
 * for a reason. It must be a STRICT COMPRESSION of `missing[0]` — the same claim,
 * fewer words — never a softer one. A row states an absence; a one-line form that
 * quietly became a description of the product would put the two-stories drift
 * this file exists to prevent into the smallest, most-read surface we have.
 *
 * Without it the inline form falls back to `capability`, which names the feature
 * rather than its absence — true, but read as a heading, not as a gap.
 */

/** @type {Record<string, SocketEntry>} */
export const SOCKETS = {
    'launchpad.list': {
        capability: 'Launchpad — token sales, allocations and subscription rounds.',
        deadPath: '/uc/activity/page-query',
        tracker: 'launch.launchpad',
        missing: [
            'There is no svc-launch. The edge route table has no launch prefix.',
            'svc-protocol serves launch.status, and that is the ERC-20 token FACTORY — whether a creator can deploy a contract. It has no concept of a sale, a round, an allocation or a participant.',
            'No service anywhere holds a sale, its supply, its schedule or its progress.'
        ],
        needed: [
            'A service that owns sale rounds: supply, price, window, per-account limits and state.',
            'A public list procedure behind the edge, and a route for it.',
            'Every figure a round shows — progress, supply, subscribed amount — read from that service, never computed in the browser.'
        ]
    },

    'launchpad.detail': {
        capability: 'Launchpad round — the terms of one sale, and joining it.',
        deadPath: '/uc/activity/detail · /uc/activity/attend',
        tracker: 'launch.launchpad',
        missing: [
            'The same gap as the launchpad list: no service owns a sale round, so there are no terms to read.',
            'Joining a round MOVES VALUE. It debits a subscription and later credits an allocation, and there is no ledger recipe for either. Doctrine §0.6 puts that write in packages/ledger-client and nowhere else.',
            'The retired flow also read a venue wallet balance, which is not the ledger and never was.'
        ],
        needed: [
            'The round service above, plus ledger recipes for subscribe and allocate, with the failure tests that go with a money path.',
            'A verification-tier decision: who may join a sale, in which jurisdictions.',
            'Until both exist this screen cannot take an amount from anyone, so it no longer offers to.'
        ]
    },

    'launchpad.myorders': {
        capability: 'My launchpad participation — rounds joined, amounts, and their state.',
        deadPath: '/uc/activity/getmyorders',
        tracker: 'launch.launchpad',
        missing: [
            'No service records participation in a sale, because no service records the sale.',
            'The retired columns included a filled amount and a turnover — money figures with no book behind them.'
        ],
        needed: [
            'The round service above, and a scoped per-account read of that account participation.',
            'Amounts on the wire as decimal strings, read from the ledger side of the subscription, not from a venue table.'
        ]
    },

    'affiliate.overview': {
        capability: 'Referral programme — your invite link, your tree, and what it pays.',
        deadPath: '/uc/member/my-info · /uc/promotion/mypromotion · /uc/promotion/toprank',
        tracker: 'ops.affiliates',
        missing: [
            'svc-identity records no referrer on an account. There is no tree to count, at any level.',
            'No commission has ever been computed, because no service consumes trade fees for a referral split.',
            'THE RATES ARE NOT OURS TO PUBLISH. The retired page printed a six-tier table paying 20-60% of fees to a referrer plus a 5-15% partner share. Nobody set those numbers for this platform; they arrived with the vendored tree. Fee-share rates are an owner decision (DIRECTION-2026-07-31 §8.10), so the table is gone rather than restated.'
        ],
        needed: [
            'A referrer field captured at registration in svc-identity, and the tree read that follows from it.',
            'A fee-share recipe in packages/ledger-client — every payout is a §0.6 ledger recipe, never a balance held by a promotions module.',
            'Rates and the jurisdictions they are offered in, set by the owner. An agent may not invent them.'
        ]
    },

    'affiliate.referrals': {
        capability: 'People you referred, and whether they completed verification.',
        deadPath: '/uc/promotion/record',
        tracker: 'ops.affiliates',
        missing: [
            'This is the one screen here that pays nothing — it is a list of accounts, not money. It is still unbuildable: svc-identity stores no referrer, so there is no relation to query.'
        ],
        needed: [
            'The referrer field above.',
            'A scoped read returning only accounts that named you, and returning them pseudonymously — a referral list is other people personal data.'
        ]
    },

    'affiliate.rebates': {
        capability: 'Referral rebates — what your referrals trading has paid you back.',
        deadPath: '/uc/mine/detail/',
        tracker: 'ops.affiliates',
        missing: [
            'The referral tree does not exist, so there is nothing to attribute a fill to.',
            'No fee-share recipe exists, so no rebate has ever been posted to any account.',
            'The retired screen showed a cumulative return and a pending return. Both were venue figures, and neither had a ledger entry behind it.'
        ],
        needed: [
            'The referrer field and the fee-share recipe above.',
            'Attribution at fill time in svc-trade, emitted as an event rather than read across a service boundary.',
            'Owner-set rates, as with the programme itself.'
        ]
    },

    'affiliate.cards': {
        capability: 'Promotion cards — redeemable codes that credit an account.',
        deadPath: '/uc/promotion/promotioncard/mycard · /uc/promotion/promotioncard/exchangecard',
        tracker: 'ops.affiliates',
        missing: [
            'No service issues a code, and no service redeems one.',
            'Redemption CREDITS A BALANCE. There is no ledger recipe for it, and the funding side was never named — a credit with no matching debit is not a card, it is a mint.',
            'The retired redeem form has been removed rather than left to fail, because a form that posts a code to nothing looks like a code that was rejected.'
        ],
        needed: [
            'A promotions service owning issuance, expiry and single-use redemption.',
            'A ledger recipe naming BOTH sides: which account funds the credit. Marketing spend is a real account and must be posted as one.',
            'Owner sign-off on value and volume, for the same reason as the commission rates.'
        ]
    },

    'trade.mining': {
        capability: 'Trade-fee mining — rebate / mine amounts credited against your fills.',
        deadPath: '/uc/mine/* · api.uc.mylist (removed)',
        tracker: null,
        missing: [
            'No service credits a mine amount or fee rebate against fills. nginx never proxied the retired /uc/mine path; api.uc.mylist was deleted with the other unproxied promotions constants.',
            'The retired screen painted cumulative return, pending return, poundage and mine_amount. Those are yield figures. DIRECTION-2026-07-31 §7 requires a named source for yield; there is none here.',
            'mining.pool is a different product (Stratum shares, PPLNS). It does not cover sold fee-rebate mining, and reading it as cover would invent a programme nobody planned.',
            'No tracker row plans trade-fee mining. An empty table with those columns still says "you earned nothing yet" rather than "this programme does not exist".'
        ],
        needed: [
            'An owner decision that fee-rebate mining is a product, with named funding (not unallocated yield).',
            'A ledger recipe that posts the rebate from a real house account, and a per-account read of those postings as decimal strings.',
            'Until both exist, this screen must not show mine totals, zeros, or a filter UI that implies a book behind it.'
        ]
    },

    'token.dividends': {
        capability: 'Holder distributions — your share of platform fee revenue.',
        deadPath: '/uc/bonus/user/page',
        tracker: 'token.yield',
        missing: [
            'This one is closer than the rest, and the difference is worth being exact about. The PAYOUT maths and the ledger recipes are real: token.distributeRevenue sweeps fee sources and pays stakers pro-rata by stake and lock multiplier, one resumable ledger transaction per recipient, and it is tested.',
            'It is not a scheduled distribution. §4.3 calls for a weekly job that aggregates the house fee accounts; that job does not exist. distributeRevenue has no caller anywhere outside its own tests — no cron, no bus subscriber, no admin form — so it pays out only when a person holding admin:treasury invokes it by hand, and otherwise never.',
            'The amounts it distributes are typed by that person. The sources on the wire are checked for decimal shape and nothing more; no code compares them against the houseFees balance they claim to sweep. So the figure paid is an operator assertion, not a reading of what the platform earned.',
            'And there is still no READ. No token:read procedure returns one account distribution history, so a holder who genuinely was paid has no way to see it and this screen could not show it if they had been.',
            'The retired screen also put a distribution total through new Number(...).toFixed(8). Money in a JS number is prohibited outright, and at eight decimal places against numeric(38,18) it silently truncates.'
        ],
        needed: [
            'The §4.3 aggregation job: read the house fee accounts per asset for a window, and claim that window in a row before posting, so a run is resumable and a window cannot be settled twice on typed input.',
            'A token:read procedure returning the caller distribution history and total, sourced from the ledger postings distributeRevenue already writes.',
            'Amounts as decimal strings end to end. No toFixed, no Number, no float arithmetic in the browser.',
            'Until the job exists, any copy here says "distributions are settled by the operator", never "you earn yield automatically". Correct maths behind a manual action is not a flywheel.'
        ]
    },

    'token.rights': {
        capability: 'What holding IFC entitles you to — supply, distributions and node rights.',
        deadPath: 'none — this page never called a backend. It was static marketing text.',
        tracker: 'token.yield',
        missing: [
            'The page this replaced asserted, in hardcoded English with nothing behind it: a fixed supply that is never inflated; that holders share in trading-fee revenue and listing distributions; that you may stake toward a super node; that node operators carry governance weight, early visibility on listings, listing priority and a claim on future distributions; that early participants receive a development allocation. It also offered a whitepaper PDF that is not in this repository.',
            'Supply is not fixed in the sense that sentence means. svc-token mints on an emission schedule with a halving interval and a cap held in token_params — new IFC is created every epoch, and the auto-tick can do it unattended. A cap is not the absence of inflation.',
            'No revenue share is automatic. See the token.dividends socket on the distributions screen: the payout path is real, the job that would run it is not.',
            'There is no super node, no node operator, no listing priority, no early-visibility right and no development allocation. Nothing in any of the seventeen services implements any of them, and no tracker row plans them.',
            'THESE WERE NOT OUR CLAIMS TO MAKE. Rights attached to a token — revenue share, allocations, node economics — are owner decisions (DIRECTION-2026-07-31 §8.10), and every promise above arrived with the vendored tree describing a different platform. They are gone rather than restated with our numbers in them.',
            'One thing worth saying plainly on a page about the token: IFC is a ledger asset, not a coin. No contract in this repository mentions it, there is no chain and no deposit or withdrawal path. Supply is rows in Postgres and balances in svc-ledger. The burn account is an ordinary internal account we control, so "burned" means we agreed not to move it again, not that anything makes it unmovable. You cannot self-custody IFC or verify its supply independently of us.'
        ],
        needed: [
            'An owner decision on what IFC actually entitles a holder to, expressed as mechanisms rather than a page: which revenue, at what share, to whom, in which jurisdictions.',
            'For each right kept: the service that implements it and the ledger recipe that pays it. A right with no recipe is a sentence.',
            'A distribution table and a supply statement generated from token_params and the ledger, not typed into a template — the figures on a token page must be the ones the system is actually running.'
        ]
    },

    'token.governance': {
        capability: 'IFC-weighted governance — proposing, voting, and the outcome of a vote.',
        deadPath: 'none — this page showed a governance icon and never called anything.',
        tracker: 'token.governance',
        missing: [
            'Ballots are real and this is the part worth being exact about. svc-token records proposals and votes, voting weight is your active stake snapshotted inside the same transaction as the ballot so a later unstake cannot erase it and a later stake cannot amplify it, zero-stake accounts are refused, and one account casts one ballot per proposal by unique index.',
            'The OUTCOME does not exist. A proposal can be passed, rejected, executed or cancelled according to its own status column, and no code in this repository writes any of those four values. There is no quorum, no pass threshold, no job that closes a vote when its window ends, and no executor that does the thing a passed proposal asked for.',
            'So every proposal ever opened is still open. A vote can be counted — the detail read recomputes a tally — and then nothing consumes the count. Votes are recorded and are not, at present, decisions.',
            'A proposal opened with a start date in the future is worse off again: it is created as a draft, nothing can move it to open, and voting requires open. It can never be voted on at all.',
            'What is missing is not a screen. Pointing a voting UI at these procedures would work, and would be the dishonest outcome: people would cast weighted ballots in the belief that a majority does something.'
        ],
        needed: [
            'Quorum and pass threshold, set by the owner. An agent must not pick the numbers that decide what a majority means.',
            'A close job that ends a vote on its window and an open job that starts a scheduled one, so a proposal state is a function of time rather than of who last called an API.',
            'An executor per proposal kind, each of which crosses a boundary this service does not own: listing reaches svc-trade, curriculum reaches svc-academy, fee_param writes token_params. Those are contract-first changes, not local ones.',
            'For grant: a ledger recipe, because funding a grant moves value and Doctrine §0.6 puts that write in packages/ledger-client and nowhere else. Recipes are an owner carve-out (DIRECTION §3).',
            'Not a status flip. A mutation that marked a proposal passed without enacting it would look to a voter exactly like governance and be none — which is why the gap is stated here instead of being closed cheaply.'
        ]
    },

    'cms.announcements': {
        capability: 'Platform announcements — operator-authored posts, and the three most recent on the landing strip.',
        deadPath: '/uc/announcement/page · /uc/announcement/more',
        tracker: null,
        /* Same claim as missing[0], one line for IxNoSurface inline (landing strip).
           Matches cms.noticePage.announcementsStrip in en.js — one statement, two homes. */
        strip: 'No announcements — nothing behind the front door publishes them.',
        missing: [
            'No service authors, stores or serves broadcast content. The edge route table (services/svc-edge/src/routes.ts) carries fifteen prefixes and none of them returns an article, so there is no announcement to list.',
            'The path is not even reached. nginx.conf proxies exactly two prefixes — /api/ to svc-edge and /ws to svc-ws — and everything else falls to `try_files $uri $uri/ /index.html`. `/uc/announcement/page` therefore answers 200 with the shell\'s own HTML document.',
            'THAT IS WHAT PRODUCED THE EMPTY ERROR TOAST. The caller tests `resp.code == 0` against that HTML string, which is never true, and takes the failure branch — which raises a red notification whose body is `resp.message`, a field an HTML string does not have. The reader is shown an error with a title and no reason.',
            'svc-notify is the nearest live thing and it is not this one. `notify.list` is a per-user inbox written by services; an announcement board is addressed to everyone and written by an operator. pages/cms/Notice.vue already shows the two as two things rather than renaming one into the other.'
        ],
        needed: [
            'A service that owns broadcast posts — authorship, publish window, locale and ordering — with a public list procedure behind the edge and a route for it.',
            'A tracker row, before any of that. Nothing in tooling/tracker/features.mjs plans announcements today. The strip is socketed rather than deleted because it promises no money and no entitlement, so the delete rule above does not reach it; it is furniture the shell owns, not a payout nobody can fund.',
            'Until the service exists the strip states this absence and raises nothing. A client must not report a failure the platform never reported — the toast was an assertion about the running system, made from a parse that could not have succeeded.',
            'Index.vue residual (RP2 sole owner of that file): stop loadDataPage\'s /uc/announcement fetch and the empty $Notice.error toast; render <IxNoSurface socket-key="cms.announcements" :inline="true" /> in the strip instead.'
        ]
    }
};

/**
 * Screens removed rather than socketed, and why.
 *
 * Recorded here because the adoption ADR is explicit that silence is what is
 * forbidden. A deleted screen with no written reason is indistinguishable from
 * a screen nobody noticed. Both are recoverable from git; neither is a
 * decision that was hidden.
 *
 * @type {{ screen: string, route: string, deadPath: string, reason: string }[]}
 */
export const REMOVED = [
    {
        screen: 'pages/envelope/Envelope.vue',
        route: '/envelope/:eno',
        deadPath: '/uc/redenvelope/query · /uc/redenvelope/code · /uc/redenvelope/receive',
        reason:
            'Gift-claim links. No tracker row plans this, at any phase — unlike the referral and launchpad screens, which have ops.affiliates and launch.launchpad. It promises a payout with no ledger recipe and no funding account. It is reachable only by an inbound shared link, so socketing it would leave a page nobody can arrive at legitimately. And it was the only screen of the ten that collected a phone number from an ANONYMOUS visitor and triggered an SMS — on a China-only mobile regex with country hardcoded to "China", a regional growth mechanic that arrived with the vendored tree and was never a decision anyone here took. Deleting removes an unauthenticated PII intake that answered to nothing.'
    },
    {
        screen: 'components/uc/InnovationMinings.vue',
        route: '/uc/innovation/myminings',
        deadPath: '/uc/miningorder/my-minings',
        reason:
            'Cloud-mining contracts — buy a contract, receive a daily yield. No tracker row plans it. mining.pool is a DIFFERENT product (Stratum shares, PPLNS payouts: you point hardware at us and we pay for work done), and reading it as cover for a sold-yield contract would be a stretch nobody asked for. The screen rendered a daily profit and a current daily profit per position, which is a yield figure with no named source — DIRECTION-2026-07-31 §7 is explicit that yield must have a named source, and that paying from treasury is marketing spend and must not be described as yield. A screen quoting a return the platform does not pay is a promise we cannot keep, and there is nothing behind it to socket onto.'
    }
];

/** Look up a socket row. Returns null rather than throwing, like moduleByKey. */
export function socketByKey(key) {
    return Object.prototype.hasOwnProperty.call(SOCKETS, key) ? SOCKETS[key] : null;
}

export default { SOCKETS: SOCKETS, REMOVED: REMOVED, socketByKey: socketByKey };
