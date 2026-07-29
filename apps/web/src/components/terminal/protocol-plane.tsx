'use client';

import { useCallback, useState } from 'react';
import { Panel, StatBlock } from '@intafaced/ui';
import { predictAccount, protocolHealth } from '@/lib/api/services';
import { useAnonymousEdge } from '@/lib/providers';
import { describeFailure, type Failure } from '@/lib/result';
import { useService } from '@/lib/use-service';
import { FailureNotice, LoadingNotice, SocketPanel } from './socket-panel';
import styles from './terminal.module.css';

/**
 * THE PROTOCOL PLANE — the DEX's front door (§17.5).
 *
 * `svc-dex` is not a module beside the exchange; it IS this plane. What exists
 * of it today is `svc-protocol`: self-custody ERC-4337 accounts, deterministic
 * addresses, scoped session keys. Everything on this plane is
 * `publicJurisdictionProcedure('protocol', 'protocol')` — permissionless, and
 * this app calls it that way, with no Authorization header at all.
 *
 * What is REAL here:
 *   · `protocol.health` — chain id, relay availability, and `custodial: false`
 *     asserted by the service itself. The client's schema makes `true` an
 *     invalid answer (see `wire.ts`), so the sovereign badge cannot be drawn
 *     over a deployment that contradicts it.
 *   · `protocol.predictAddress` — the address a key will own, before anything
 *     is deployed. No login, no wallet connection, no account: it is arithmetic
 *     over public constants, which is exactly why it needs no permission.
 *
 * What is NOT product-ready yet (sockets, not missing directories):
 *   · **an on-chain order book.** INTACORE is §17.2 P1 — no live CLOB/AMM.
 *   · **swap / order entry.** Session grants exist; the on-chain venue does not.
 *   · **balances.** `svc-indexer` exists and can project chain state, but the
 *     feed is still propped (NullChain / empty projections) and the terminal
 *     does not yet wire balance reads into this plane.
 */

const copy = {
  status: 'Protocol Plane status',
  account: 'Your smart account',
  chainId: 'Chain',
  relay: 'Relay',
  custody: 'Custody',
  custodyValue: 'Non-custodial',
  relayOn: 'Available',
  relayOff: 'Not enabled',
  loading: 'Asking svc-protocol…',
  ownerLabel: 'Owner address (0x…)',
  predict: 'Derive address',
  predicting: 'Deriving…',
  address: 'Account address',
  deployed: 'Deployed',
  notDeployed: 'Not deployed — the address is real before anything is on chain',
  factory: 'Factory',
  ownerHint:
    'Paste any address. Nothing is signed, nothing is sent, and no session is created — this is the counterfactual address that key will own.',
  ownerInvalid: 'Not a 20-byte hex address',
  bookTitle: 'On-chain order book · INTACORE',
  bookReason:
    'There is no live CLOB or AMM yet. §17.2 sequences INTACORE as P1. svc-indexer exists for read models, but the chain feed is still a prop — not a live book.',
  bookBlocked: 'INTACORE CLOB · live chain feed',
  entryTitle: 'Sovereign order entry',
  entryReason:
    'The signing half exists: svc-protocol builds session-key grants and relays user-signed operations, and holds no key that could move funds. The venue half does not — there is nothing on chain to route an order to, so there is no form here to fill in.',
  entryBlocked: 'INTACORE CLOB · AMM pools',
  balanceTitle: 'Vault balances',
  balanceReason:
    'Balances on this plane are chain state. svc-indexer can project them, but with a propped feed and no terminal wiring yet the platform correctly shows no Fiat-ledger balance for Protocol funds.',
  balanceBlocked: 'live chain feed · terminal wiring',
} as const;

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function ProtocolPlanePanels() {
  return (
    <>
      <ProtocolStatus />
      <SmartAccount />
      <SocketPanel title={copy.bookTitle} reason={copy.bookReason} blockedBy={copy.bookBlocked} />
      <SocketPanel title={copy.entryTitle} reason={copy.entryReason} blockedBy={copy.entryBlocked} />
      <SocketPanel title={copy.balanceTitle} reason={copy.balanceReason} blockedBy={copy.balanceBlocked} />
    </>
  );
}

function ProtocolStatus() {
  const edge = useAnonymousEdge();
  const call = useCallback(() => protocolHealth(edge), [edge]);
  const { state } = useService(call, 'protocol.health');

  return (
    <Panel title={copy.status} live={state.status === 'ok'}>
      {state.status === 'loading' && <LoadingNotice label={copy.loading} />}
      {state.status === 'idle' && <LoadingNotice label={copy.loading} />}
      {state.status === 'failed' && <FailureNotice failure={state.failure} />}
      {state.status === 'ok' && (
        <div className={styles.statGrid}>
          <StatBlock label={copy.custody} value={copy.custodyValue} />
          <StatBlock label={copy.chainId} value={String(state.value.chainId)} />
          <StatBlock label={copy.relay} value={state.value.relayEnabled ? copy.relayOn : copy.relayOff} />
        </div>
      )}
    </Panel>
  );
}

function SmartAccount() {
  const edge = useAnonymousEdge();
  const [owner, setOwner] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [account, setAccount] = useState<{ address: string; factory: string; deployed: boolean } | null>(null);

  const valid = ADDRESS.test(owner.trim());

  async function derive() {
    if (!valid || pending) return;
    setPending(true);
    setFailure(null);
    setAccount(null);

    const result = await predictAccount(edge, owner.trim());
    setPending(false);
    if (result.ok) setAccount({ address: result.value.address, factory: result.value.factory, deployed: result.value.deployed });
    else setFailure(result);
  }

  return (
    <Panel title={copy.account}>
      <div className={styles.ticket}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{copy.ownerLabel}</span>
          <input
            className={`${styles.input} if-numeric`}
            autoComplete="off"
            spellCheck={false}
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          />
        </label>

        <button type="button" className={styles.submit} disabled={!valid || pending} onClick={() => void derive()}>
          {pending ? copy.predicting : copy.predict}
        </button>

        {owner.trim() !== '' && !valid && <span className={styles.pending}>{copy.ownerInvalid}</span>}
        <span className={styles.pending}>{copy.ownerHint}</span>

        {failure && <span className={styles.ticketFailure}>{describeFailure(failure)}</span>}

        {account && (
          <div className={styles.sessionBox}>
            <div className={styles.summary}>
              <span className={styles.fieldLabel}>{copy.address}</span>
              <span className={`${styles.wrapValue} if-numeric`}>{account.address}</span>
            </div>
            <div className={styles.summary}>
              <span className={styles.fieldLabel}>{copy.factory}</span>
              <span className={`${styles.wrapValue} if-numeric`}>{account.factory}</span>
            </div>
            <span className={styles.pending}>{account.deployed ? copy.deployed : copy.notDeployed}</span>
          </div>
        )}
      </div>
    </Panel>
  );
}
