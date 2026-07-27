/**
 * @intafaced/i18n — every user-facing string, keyed (§9, §14.4).
 *
 * The contract this package offers the rest of the OS:
 *
 *   - `createTranslator(locale, catalog)` → `t(key, params)`, where the key set
 *     is a closed union and the params are derived from the message itself. A
 *     string that is not in the catalog cannot be rendered.
 *   - `formatMoney(amountString, currency, locale)` — money is a decimal string
 *     and stays one. No float touches a balance on the way to a screen.
 *   - A locale registry with RTL flags, so adding a language is a data change.
 *
 * Nothing here does I/O. Catalogs are data; loading them is the app's job.
 */
export * from './catalog.js';
export * from './locales.js';
export * from './format.js';
export * from './t.js';
