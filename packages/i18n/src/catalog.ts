/**
 * The message catalog — §9: "all surfaces keyed from day one; 100+ languages =
 * translation files, not refactors".
 *
 * English is the source of truth. Every other language is a `Catalog` derived
 * from it, and the type system enforces that derivation: a translation missing
 * a key is a COMPILE error, not a `undefined` that reaches a user as a blank
 * button. That is the entire reason this package exists before the surfaces do.
 *
 * Conventions:
 *  - Keys are dot-namespaced by surface: `<surface>.<area>.<thing>`.
 *  - Placeholders are `{name}` and are extracted into the type of `t()`, so a
 *    forgotten interpolation param is also a compile error.
 *  - A message that varies with a count is a `PluralMessage`, never a hand-rolled
 *    `n === 1 ? a : b` — see `t.ts`.
 *  - Copy obeys Doctrine §0.7: no third-party system names, ever.
 */

/** CLDR plural categories. Which of these a language uses is `Intl`'s business, not ours. */
export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/**
 * A count-dependent message. `other` is mandatory because CLDR guarantees every
 * language has it; the rest are supplied per language as that language requires.
 */
export type PluralMessage = { readonly [C in PluralCategory]?: string } & { readonly other: string };

export type Message = string | PluralMessage;

// ── English — the source of truth ───────────────────────────────────────────

export const en = {
  // ── common · actions, states, labels ──────────────────────────────────────
  'common.action.confirm': 'Confirm',
  'common.action.cancel': 'Cancel',
  'common.action.save': 'Save',
  'common.action.continue': 'Continue',
  'common.action.back': 'Back',
  'common.action.close': 'Close',
  'common.action.retry': 'Try again',
  'common.action.copy': 'Copy',
  'common.action.copied': 'Copied',
  'common.action.search': 'Search',
  'common.state.loading': 'Loading…',
  'common.state.empty': 'Nothing here yet',
  'common.label.amount': 'Amount',
  'common.label.total': 'Total',
  'common.label.fee': 'Fee',
  'common.label.status': 'Status',
  'common.label.date': 'Date',
  'common.results': { one: '{count} result', other: '{count} results' },

  // ── auth ──────────────────────────────────────────────────────────────────
  'auth.login.title': 'Sign in',
  'auth.login.subtitle': 'Sovereign access to your account.',
  'auth.login.emailLabel': 'Email',
  'auth.login.emailPlaceholder': 'you@example.com',
  'auth.login.passwordLabel': 'Password',
  'auth.login.submit': 'Sign in',
  'auth.login.forgotPassword': 'Forgot your password?',
  'auth.login.noAccount': 'Create an account',
  'auth.register.title': 'Create your account',
  'auth.register.submit': 'Create account',
  'auth.twofa.title': 'Two-factor verification',
  'auth.twofa.prompt': 'Enter the {digits}-digit code from your authenticator app.',
  'auth.webauthn.prompt': 'Confirm with your security key.',
  'auth.logout': 'Sign out',
  'auth.session.expired': 'Your session has expired. Sign in again.',
  'auth.kyc.upgrade': 'Raise your limits',

  // ── trade ─────────────────────────────────────────────────────────────────
  'trade.order.submit': 'Place order',
  'trade.order.buy': 'Buy',
  'trade.order.sell': 'Sell',
  'trade.order.typeLimit': 'Limit',
  'trade.order.typeMarket': 'Market',
  'trade.order.price': 'Price',
  'trade.order.quantity': 'Quantity',
  'trade.order.total': 'Order total',
  'trade.order.confirmTitle': 'Confirm order',
  'trade.order.confirmBody': '{side} {qty} {symbol} at {price}.',
  'trade.order.cancelled': 'Order cancelled',
  'trade.filled': 'Filled {qty} {symbol}',
  'trade.openOrders': { one: '{count} open order', other: '{count} open orders' },
  'trade.book.bids': 'Bids',
  'trade.book.asks': 'Asks',
  'trade.positions.title': 'Positions',
  'trade.positions.empty': 'No open positions',
  'trade.pair.change24h': '24h change',
  'trade.convert.title': 'Convert',
  'trade.convert.rate': '1 {from} = {rate} {to}',

  // ── wallet · balances ─────────────────────────────────────────────────────
  'wallet.title': 'Wallet',
  'wallet.balance.available': 'Available',
  'wallet.balance.locked': 'On hold',
  'wallet.balance.total': 'Total balance',
  'wallet.deposit': 'Deposit',
  'wallet.withdraw': 'Withdraw',
  'wallet.transfer': 'Transfer',
  'wallet.address.label': 'Deposit address',
  'wallet.address.warning': 'Send only {asset} on {network} to this address.',
  'wallet.withdraw.addressLabel': 'Destination address',
  'wallet.withdraw.allowlistOnly': 'Withdrawals go to allow-listed addresses only.',
  'wallet.withdraw.holdNotice': { one: 'Held for {count} hour', other: 'Held for {count} hours' },
  'wallet.history.title': 'Activity',
  'wallet.assets': { one: '{count} asset', other: '{count} assets' },
  'wallet.confirmations': { one: '{count} confirmation', other: '{count} confirmations' },

  // ── p2p ───────────────────────────────────────────────────────────────────
  'p2p.title': 'P2P',
  'p2p.offer.buy': 'Buy {asset}',
  'p2p.offer.sell': 'Sell {asset}',
  'p2p.offer.create': 'Post an offer',
  'p2p.offer.paymentMethods': 'Payment methods',
  'p2p.offer.priceLabel': 'Price per {asset}',
  'p2p.trade.escrowLocked': 'Escrow locked',
  'p2p.trade.markPaid': 'I have paid',
  'p2p.trade.releaseFunds': 'Release funds',
  'p2p.trade.dispute': 'Open a dispute',
  'p2p.trade.timeRemaining': 'Time remaining',
  'p2p.merchant.badge': 'Verified merchant',
  'p2p.merchant.trades': { one: '{count} trade', other: '{count} trades' },

  // ── notify · in-app inbox (title + body per kind; keys stored on the row) ──
  'notify.trade.fill.title': 'Order filled',
  'notify.trade.fill.body': '{side} {qty} on {marketId} at {price}.',
  'notify.p2p.escrow.locked.title': 'Escrow locked',
  'notify.p2p.escrow.locked.body': '{amount} {asset} locked for {fiatAmount} {fiatCurrency}.',
  'notify.p2p.escrow.released.title': 'Trade completed',
  'notify.p2p.escrow.released.body': '{amount} {asset} released. Fee {fee}.',
  'notify.p2p.escrow.refunded.title': 'Escrow refunded',
  'notify.p2p.escrow.refunded.body': '{amount} {asset} returned to the seller ({reason}).',
  'notify.identity.kyc.approved.title': 'Verification approved',
  'notify.identity.kyc.approved.body': 'You are verified at the {tier} tier.',
  'notify.identity.rank.updated.title': 'Rank updated',
  'notify.identity.rank.updated.body': 'You moved from rank {previousRank} to rank {rank}.',
  'notify.token.stake.created.title': 'Stake locked',
  'notify.token.stake.created.body': '{amount} staked on the {tier} tier.',

  // ── errors ────────────────────────────────────────────────────────────────
  'error.insufficientFunds': 'Insufficient balance.',
  'error.generic': 'Something went wrong. Try again.',
  'error.network': 'No connection. Check your network.',
  'error.notFound': 'We could not find that.',
  'error.unauthorized': 'Sign in to continue.',
  'error.forbidden': 'You do not have access to this.',
  'error.rateLimited': 'Too many requests. Wait a moment.',
  'error.validation.required': 'This field is required.',
  'error.validation.invalidAmount': 'Enter a valid amount.',
  'error.validation.invalidAddress': 'That address is not valid for {network}.',
  'error.validation.minLength': { one: 'Use at least {count} character', other: 'Use at least {count} characters' },
  'error.order.belowMinimum': 'Minimum order size is {min} {asset}.',
  'error.withdrawal.limitReached': 'You have reached your withdrawal limit for {period}.',
  'error.kyc.required': 'Verification is required for this action.',
  'error.region.blocked': 'This is not available in your region.',
} as const;

/** The English catalog's exact shape — the thing every other language is measured against. */
export type EnCatalog = typeof en;

/** Every key that exists. Adding one here is what makes it usable in `t()`. */
export type MessageKey = keyof EnCatalog;

/**
 * A complete translation. Every key is required and must keep English's shape
 * (a plural message stays plural), so `defineCatalog` fails to compile the
 * moment a key is added to English and not to a translation.
 */
export type Catalog = {
  readonly [K in MessageKey]: EnCatalog[K] extends string ? string : PluralMessage;
};

/**
 * A translation in progress. Real language files land incomplete and catch up —
 * that is normal, and `createTranslator` falls back to English per key. What is
 * NOT allowed is a key nobody ever wrote in English.
 */
export type PartialCatalog = {
  readonly [K in MessageKey]?: EnCatalog[K] extends string ? string : PluralMessage;
};

/**
 * Declare a complete catalog. Use this in every language file: it is the line
 * of defence that turns "we forgot to translate the withdraw button" into a
 * build failure instead of a support ticket.
 */
export function defineCatalog(messages: Catalog): Catalog {
  return messages;
}

/** Declare a translation that is still being filled in. Missing keys fall back to English. */
export function definePartialCatalog(messages: PartialCatalog): PartialCatalog {
  return messages;
}

/** Runtime view of the key list — for scanners, coverage reports, and tests. */
export const MESSAGE_KEYS: readonly MessageKey[] = Object.keys(en) as MessageKey[];

/** True when the key exists in the English source of truth. */
export function isMessageKey(key: string): key is MessageKey {
  return Object.prototype.hasOwnProperty.call(en, key);
}

/** True when the message varies by count. */
export function isPluralMessage(message: Message | undefined): message is PluralMessage {
  return typeof message === 'object' && message !== null && typeof message.other === 'string';
}

/**
 * Translation coverage for a language, as a fraction of the English key set.
 * Used by the language dashboard so "we support 100+ languages" is a measured
 * claim rather than a marketing one.
 */
export function coverage(catalog: PartialCatalog): { translated: number; total: number; missing: MessageKey[] } {
  const missing = MESSAGE_KEYS.filter((key) => catalog[key] === undefined);
  return { translated: MESSAGE_KEYS.length - missing.length, total: MESSAGE_KEYS.length, missing };
}

// ── Placeholder types ───────────────────────────────────────────────────────

/** Pull `{name}` placeholders out of a literal message at the type level. */
type Placeholders<S extends string> = S extends `${string}{${infer P}}${infer Rest}` ? P | Placeholders<Rest> : never;

/**
 * The params a message requires. Plural messages always require `count`; the
 * rest come from the placeholders in the message itself.
 */
export type ParamsOf<M> = M extends string ? Placeholders<M> : M extends PluralMessage ? Placeholders<M['other']> | 'count' : never;

/** The params `t(key, …)` demands for a given key. */
export type ParamsFor<K extends MessageKey> = ParamsOf<EnCatalog[K]>;
