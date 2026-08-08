/**
 * THE SUB-NAVIGATION OF THE DEEP MODULE SURFACES.
 *
 * `/bank` and `/pay` are not one screen each. Each is a vertical with several
 * screens under it, and the list of those screens lives HERE rather than being
 * re-typed in every page, for one reason: a nav that each screen writes for
 * itself is a nav that goes out of date on the screen nobody opened. One array,
 * one route table entry per row, and the tab strip on every screen of the
 * vertical is the same strip.
 *
 * `labelKey` is a key, never a word. §9 — the shell carries no untranslated
 * copy, and a nav is the most-read copy on a screen.
 *
 * `procedures` is the tRPC surface that row actually calls. It is not
 * decoration either: it is what lets a reader check a screen against the
 * service, and it is what makes an added row with no backend obvious in review.
 */

/** svc-bank. Every row maps to a router in services/svc-bank/src/router.ts. */
export const BANK_NAV = [
    { to: '/bank', labelKey: 'intafaced.bank.nav.overview', procedures: 'spaces.unnamed · loans.health' },
    { to: '/bank/spaces', labelKey: 'intafaced.bank.nav.spaces', procedures: 'spaces.*' },
    { to: '/bank/transfers', labelKey: 'intafaced.bank.nav.transfers', procedures: 'transfers.*' },
    { to: '/bank/earn', labelKey: 'intafaced.bank.nav.earn', procedures: 'earn.*' },
    { to: '/bank/loans', labelKey: 'intafaced.bank.nav.loans', procedures: 'loans.*' },
    { to: '/bank/cards', labelKey: 'intafaced.bank.nav.cards', procedures: 'cards.*' },
    { to: '/bank/ramps', labelKey: 'intafaced.bank.nav.ramps', procedures: 'ramps.*' },
    { to: '/bank/analytics', labelKey: 'intafaced.bank.nav.analytics', procedures: 'analytics.spend' }
];

/**
 * svc-pay. Every row maps to a router in services/svc-pay/src/router.ts.
 *
 * `deposit.credit` has NO row and never will: it is `admin:treasury`, it credits
 * a user's spendable balance, and an operator surface on a customer page is how
 * a customer surface becomes an operator one.
 */
export const PAY_NAV = [
    { to: '/pay', labelKey: 'intafaced.pay.nav.overview', procedures: 'health · railHealth' },
    { to: '/pay/money', labelKey: 'intafaced.pay.nav.money', procedures: 'withdrawal.*' },
    { to: '/pay/merchant', labelKey: 'intafaced.pay.nav.merchant', procedures: 'merchant.me · merchant.create · merchant.submitKyb' },
    { to: '/pay/links', labelKey: 'intafaced.pay.nav.links', procedures: 'merchant.listLinks · merchant.createLink' },
    { to: '/pay/payments', labelKey: 'intafaced.pay.nav.payments', procedures: 'payment.*' },
    { to: '/pay/settlements', labelKey: 'intafaced.pay.nav.settlements', procedures: 'settlement.*' },
    { to: '/pay/checkout', labelKey: 'intafaced.pay.nav.checkout', procedures: 'resolveLink · checkout.*' }
];

export default { BANK_NAV: BANK_NAV, PAY_NAV: PAY_NAV };
