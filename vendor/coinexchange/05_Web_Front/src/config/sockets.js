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

    'token.dividends': {
        capability: 'Holder distributions — your share of real yield from platform fees.',
        deadPath: '/uc/bonus/user/page',
        tracker: 'token.yield',
        missing: [
            'This one is closer than the rest, and the difference is worth being exact about. svc-token DOES distribute real yield: token.distributeRevenue is live and posts through the ledger.',
            'What is missing is the READ. distributeRevenue carries admin:treasury — it is an operator action. There is no token:read procedure that returns one account distribution history, so a holder has no way to see what they were paid.',
            'The retired screen also put a distribution total through new Number(...).toFixed(8). Money in a JS number is prohibited outright, and at eight decimal places against numeric(38,18) it silently truncates.'
        ],
        needed: [
            'A token:read procedure returning the caller distribution history and total, sourced from the ledger postings distributeRevenue already writes.',
            'Amounts as decimal strings end to end. No toFixed, no Number, no float arithmetic in the browser.',
            'Nothing else — the money path underneath this is already built and already correct. This is a missing window onto it, not a missing product.'
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
