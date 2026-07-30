import { DEFAULT_LOCALE, createTranslator, isSupportedLocale, type ParamValue } from '@intafaced/i18n';
import type { Notification } from '../store.js';

/**
 * COPY RENDERING FOR OUT-OF-APP CHANNELS.
 *
 * The inbox stores keys, not sentences — `title_key`, `body_key`, `params` —
 * and the web client renders them. An email has no client, so somebody has to
 * render it, and that somebody is this file, from the SAME catalog
 * (`@intafaced/i18n`).
 *
 * That is not a convenience. It is the only arrangement in which an email
 * cannot say something a screen could not:
 *
 *   · Every string is a catalog key, so §9's "keyed from day one" holds for
 *     channels that ship no UI.
 *   · The catalog is scanned by `pnpm scan:brand`, so §0.7 holds for copy that
 *     leaves the platform — which is precisely where a partner's name would
 *     otherwise slip in, because nobody reviews an email template.
 *   · A translation added for the web is instantly live on email and SMS. No
 *     second catalogue to drift.
 *
 * Mode is `prod` deliberately: a missing key must not throw and kill a margin
 * call. It falls back to English, reports, and — if the key exists nowhere —
 * renders the key itself, which is ugly, greppable, and not blank. The gate that
 * stops that reaching a user is a test over the kinds this service emits, not a
 * runtime exception on the delivery path.
 */

export interface RenderedCopy {
  readonly title: string;
  readonly body: string;
}

/**
 * Params come off a JSONB column and an event payload, so they are `unknown`.
 * The translator takes strings, numbers and bigints; everything else is
 * stringified rather than dropped, because a placeholder left visible is a bug
 * someone reports and a silently missing value is a bug nobody sees.
 */
function toParamValues(params: Record<string, unknown>): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
      out[key] = value;
    } else if (value === null || value === undefined) {
      // Nullable payload fields (an open-ended stake, a market order with no
      // price) are legitimately absent. An em dash reads; "null" does not.
      out[key] = '—';
    } else {
      out[key] = JSON.stringify(value);
    }
  }
  return out;
}

/** Fall back to the default locale rather than handing `Intl` something it will throw on. */
export function normaliseLocale(locale: string | null | undefined): string {
  return locale && isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
}

export function renderNotification(notification: Notification, locale: string): RenderedCopy {
  const t = createTranslator(normaliseLocale(locale), undefined, { mode: 'prod' });
  const params = toParamValues(notification.params);
  return {
    title: t.tUnsafe(notification.titleKey, params),
    body: t.tUnsafe(notification.bodyKey, params),
  };
}

/** The address-confirmation message. Same catalog, same rules. */
export function renderVerification(locale: string, code: string, ttlMinutes: number): RenderedCopy {
  const t = createTranslator(normaliseLocale(locale), undefined, { mode: 'prod' });
  return {
    title: t.t('notify.channel.verify.title'),
    body: t.t('notify.channel.verify.body', { code, minutes: ttlMinutes }),
  };
}
