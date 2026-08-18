import { Chip } from '@/components/chip';
import { consoleCopy } from '@/lib/console-copy';
import { AUTHORITY_REACH, type ConsoleStatus } from '@/lib/console-status';

/**
 * "THIS CONSOLE CANNOT HALT ANYTHING" — said on every page, or not at all.
 *
 * ── Why it is in the layout and not on the board ────────────────────────────
 *
 * The kill-switch board already rendered an honest `Control plane: not
 * configured` panel, and it was not enough. An operator lands on `/ledger`
 * during an incident because that is the screen with the word "freeze" on it;
 * they never see a panel that only exists on `/`. Worse, the console 404'd on
 * its own `/api/kill-switch` in the deployed build, so the one page carrying the
 * warning was also the page nobody had a reason to open first.
 *
 * A safety control's inability to act is a property of the whole console, so it
 * is stated in the frame around every screen.
 *
 * ── It renders nothing when fullyConfigured ─────────────────────────────────
 *
 * Deliberately. A banner that is always present is furniture, and furniture is
 * not read. The absence of this strip is the only "all green" signal, and it
 * fires only when EDGE_URL plus both operator and treasury tokens are set.
 * Missing either token or the edge address keeps the strip up.
 *
 * Never renders a credential — `ConsoleStatus` carries booleans and variable
 * NAMES only, which is the property `console-status.ts` maintains.
 *
 * Operator-visible sentences resolve through `@intafaced/i18n`. A missing key
 * renders the key name — never invented English.
 */

export interface ConsoleStatusBannerProps {
  status: ConsoleStatus;
}

export function ConsoleStatusBanner({ status }: ConsoleStatusBannerProps) {
  if (status.fullyConfigured) return null;

  const blocked = [status.module, status.treasury].filter((a) => !a.configured);

  return (
    <div className="adm-alertstrip" data-severity={status.canHaltAnything ? 'partial' : 'none'} role="status">
      <Chip tone="danger" dot>
        {status.canHaltAnything ? consoleCopy('admin.console.banner.chip.partial') : consoleCopy('admin.console.banner.chip.none')}
      </Chip>
      <span className="adm-alertstrip__body">
        <strong>
          {status.canHaltAnything ? consoleCopy('admin.console.banner.title.partial') : consoleCopy('admin.console.banner.title.none')}
        </strong>{' '}
        {blocked.map((authority) => (
          <span key={authority.authority} className="adm-alertstrip__item">
            {consoleCopy('admin.console.banner.item.lead', { reach: AUTHORITY_REACH[authority.authority] })}{' '}
            {authority.missing.map((name, i) => (
              <span key={name}>
                {i > 0 && ' + '}
                <code>{name}</code>
              </span>
            ))}
            .{' '}
          </span>
        ))}{' '}
        {consoleCopy('admin.console.banner.disclaimer')}
      </span>
    </div>
  );
}
