import { Chip } from '@/components/chip';
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
 * ── It renders nothing when everything is configured ────────────────────────
 *
 * Deliberately. A banner that is always present is furniture, and furniture is
 * not read. The absence of this strip is the signal that both authorities are
 * wired; the presence of it is a fact about what is missing, in the operator's
 * own vocabulary ("cannot freeze the ledger") followed by the exact variable
 * name to set.
 *
 * Never renders a credential — `ConsoleStatus` carries booleans and variable
 * NAMES only, which is the property `console-status.ts` maintains.
 */

export interface ConsoleStatusBannerProps {
  status: ConsoleStatus;
}

export function ConsoleStatusBanner({ status }: ConsoleStatusBannerProps) {
  if (status.module.configured && status.treasury.configured) return null;

  const blocked = [status.module, status.treasury].filter((a) => !a.configured);

  return (
    <div className="adm-alertstrip" data-severity={status.canHaltAnything ? 'partial' : 'none'} role="status">
      <Chip tone="danger" dot>
        {status.canHaltAnything ? 'Partly unconfigured' : 'Cannot halt anything'}
      </Chip>
      <span className="adm-alertstrip__body">
        <strong>
          {status.canHaltAnything
            ? 'This console cannot reach every platform switch.'
            : 'This console cannot halt anything. Every switch below is inert.'}
        </strong>{' '}
        {blocked.map((authority) => (
          <span key={authority.authority} className="adm-alertstrip__item">
            Cannot {AUTHORITY_REACH[authority.authority]} — set{' '}
            {authority.missing.map((name, i) => (
              <span key={name}>
                {i > 0 && ' + '}
                <code>{name}</code>
              </span>
            ))}
            .{' '}
          </span>
        ))}{' '}
        Nothing here is a value: these are variable names on the <code>admin</code> container. See{' '}
        <code>docs/OWNER-OPS-CHECKLIST-2026-07-31.md</code> §7.
      </span>
    </div>
  );
}
