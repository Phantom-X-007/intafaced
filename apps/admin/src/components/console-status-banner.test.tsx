import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConsoleStatusBanner } from './console-status-banner';
import { readConsoleStatus } from '@/lib/console-status';

/**
 * WHAT THE OPERATOR ACTUALLY READS AT 3AM.
 *
 * Assertions are made against the served HTML rather than a component tree,
 * because the bug being guarded against was in the served HTML: a console
 * showing a board of switches — one labelled "halts ALL value movement
 * platform-wide" — while holding no credential to move any of them.
 */

const TOKEN = 'operator-token-value';
const TREASURY = 'treasury-token-value';

const env = (over: Record<string, string> = {}): NodeJS.ProcessEnv => ({ ...over }) as NodeJS.ProcessEnv;
const render = (e: NodeJS.ProcessEnv) => renderToStaticMarkup(<ConsoleStatusBanner status={readConsoleStatus(e)} />);

describe('ConsoleStatusBanner', () => {
  /**
   * A banner that is always present is furniture, and furniture is not read.
   * Its ABSENCE is the signal that both authorities are wired.
   */
  it('renders nothing when both authorities are configured', () => {
    const html = render(env({ EDGE_URL: 'http://edge:4000', ADMIN_OPERATOR_TOKEN: TOKEN, ADMIN_TREASURY_TOKEN: TREASURY }));

    expect(html).toBe('');
  });

  it('says the console cannot halt anything when nothing is configured', () => {
    const html = render(env());

    expect(html).toContain('Cannot halt anything');
    expect(html).toContain('Every switch below is inert');
    expect(html).toContain('data-severity="none"');
  });

  /**
   * The partial case is the dangerous one: the board looks alive because module
   * switches work, while the money plane cannot be stopped at all.
   */
  it('distinguishes a partly-wired console from a dead one', () => {
    const html = render(env({ EDGE_URL: 'http://edge:4000', ADMIN_OPERATOR_TOKEN: TOKEN }));

    expect(html).toContain('Partly unconfigured');
    expect(html).toContain('data-severity="partial"');
    expect(html).toContain('cannot reach every platform switch');
  });

  it('names the variable to set, and only the one that is missing', () => {
    const html = render(env({ EDGE_URL: 'http://edge:4000', ADMIN_OPERATOR_TOKEN: TOKEN }));

    expect(html).toContain('ADMIN_TREASURY_TOKEN');
    expect(html).not.toContain('ADMIN_OPERATOR_TOKEN');
    expect(html).toContain('freeze the ledger (stop ALL value movement platform-wide)');
  });

  /**
   * This strip renders in the layout, on every page. A credential reaching it
   * reaches every served response.
   */
  it('never renders a credential value', () => {
    const partial = render(env({ EDGE_URL: 'http://edge:4000', ADMIN_OPERATOR_TOKEN: TOKEN }));
    const none = render(env({ ADMIN_OPERATOR_TOKEN: TOKEN, ADMIN_TREASURY_TOKEN: TREASURY }));

    for (const html of [partial, none]) {
      expect(html).not.toContain(TOKEN);
      expect(html).not.toContain(TREASURY);
    }
  });

  it('is announced to assistive technology rather than being colour alone', () => {
    expect(render(env())).toContain('role="status"');
  });
});
