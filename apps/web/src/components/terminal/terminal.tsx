'use client';

import { useCallback, useState } from 'react';
import { Panel } from '@intafaced/ui';
import { listMarkets } from '@/lib/api/services';
import type { Market } from '@/lib/api/wire';
import { useEdge, usePlane } from '@/lib/providers';
import { useService } from '@/lib/use-service';
import { AccountEquity } from './account-equity';
import { Blotter } from './blotter';
import { LiveChart } from './live-chart';
import { LiveOrderBook } from './live-book';
import { LiveTradeTape } from './live-tape';
import { OrderTicket } from './order-ticket';
import { CustodyBanner, PlaneSwitch } from './plane-switch';
import { ProtocolPlanePanels } from './protocol-plane';
import { SignInPanel } from './sign-in';
import { FailureNotice, LoadingNotice } from './socket-panel';
import styles from './terminal.module.css';

/**
 * THE TERMINAL.
 *
 * Two planes, one layout. Which panels exist is decided by the plane, because
 * the planes are not two skins over one product — one of them has a custodian
 * and the other structurally cannot.
 *
 * ── What is live, and what is a socket ─────────────────────────────────────
 *
 * Live, against real mounted procedures through svc-edge:
 *   · the market list (`trade.markets.list`, public)
 *   · sign-in and verification tier (`identity.auth.login`, `identity.kyc.status`)
 *   · open orders and fills (`trade.orders.open`, `trade.fills.mine`)
 *   · order entry (`trade.orders.create`)
 *   · OHLCV chart (`GET /api/v1/ohlcv` — fill aggregation; honest [] if never traded)
 *   · account equity (`GET /api/v1/account/balance` — self-only ledger projection)
 *   · Protocol Plane status and smart-account derivation (`protocol.health`,
 *     `protocol.predictAddress`)
 *
 * Live, from svc-ws (second public origin — edge cannot carry a socket):
 *   · the order book — snapshot + sequenced deltas (`channel` default / depth)
 *   · the public trade tape — `TradePrint` frames on `channel=trades`
 *
 * Still sockets (honest holes):
 *   · hotkeys / sub-accounts (not started)
 *   · everything on the Protocol Plane that needs a production chain
 *
 * The count is deliberate. Real panels and honest holes is a truthful
 * terminal; panels of plausible numbers is a demo that gets somebody hurt.
 */

const copy = {
  markets: 'Markets',
  marketsLoading: 'Asking svc-trade…',
  noMarkets: 'svc-trade has no listed markets',
  select: 'Select',
  selected: 'Selected',
} as const;

export function Terminal() {
  const edge = useEdge();
  const { plane } = usePlane();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const call = useCallback(() => listMarkets(edge), [edge]);
  const { state } = useService(call, 'trade.markets.list');

  const markets = state.status === 'ok' ? state.value : [];
  const selected = markets.find((m) => m.id === selectedId) ?? markets[0] ?? null;

  return (
    <div className={styles.terminal}>
      <header className={styles.headline}>
        <PlaneSwitch />
        <CustodyBanner />
      </header>

      {plane.id === 'protocol' ? (
        <div className={styles.protocolGrid}>
          <ProtocolPlanePanels />
        </div>
      ) : (
        <div className={styles.grid}>
          <div className={styles.bookColumn}>
            <LiveOrderBook
              marketId={selected?.id ?? null}
              tickSize={selected?.tickSize ?? '0.01'}
              lotSize={selected?.lotSize ?? '0.00000001'}
            />
            <MarketsPanel state={state} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          </div>

          <div className={styles.chartColumn}>
            <LiveTradeTape marketId={selected?.id ?? null} />
            <LiveChart symbol={selected?.symbol ?? null} />
            <Blotter markets={markets} />
          </div>

          <div className={styles.ticketColumn}>
            <SignInPanel />
            <OrderTicket market={selected} />
            <AccountEquity />
          </div>
        </div>
      )}
    </div>
  );
}

function MarketsPanel({
  state,
  selectedId,
  onSelect,
}: {
  state: ReturnType<typeof useService<Market[]>>['state'];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Panel title={copy.markets} live={state.status === 'ok'}>
      {(state.status === 'loading' || state.status === 'idle') && <LoadingNotice label={copy.marketsLoading} />}
      {state.status === 'failed' && <FailureNotice failure={state.failure} />}
      {state.status === 'ok' &&
        (state.value.length === 0 ? (
          <p className={styles.socketReason}>{copy.noMarkets}</p>
        ) : (
          <ul className={styles.marketList}>
            {state.value.map((market) => (
              <li key={market.id}>
                <button
                  type="button"
                  className={styles.marketRow}
                  data-active={market.id === selectedId}
                  aria-current={market.id === selectedId}
                  onClick={() => onSelect(market.id)}
                >
                  <span className={styles.marketSymbol}>{market.symbol}</span>
                  <span className={styles.marketMeta} data-status={market.status}>
                    {market.status}
                  </span>
                  {/* Tick size is the market's own precision, as a string. */}
                  <span className={`${styles.marketTick} if-numeric`}>{market.tickSize}</span>
                </button>
              </li>
            ))}
          </ul>
        ))}
    </Panel>
  );
}
