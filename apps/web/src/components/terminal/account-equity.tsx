'use client';

import { useCallback, useEffect, useState } from 'react';
import { Panel } from '@intafaced/ui';
import { fetchAccountBalance, type AccountBalances } from '@/lib/api/rest';
import { useEdge, useSession } from '@/lib/providers';
import { describeFailure, type Failure } from '@/lib/result';
import { DataTable, type DataTableColumn, type DataTableRow } from '@/components/data-table';
import { FailureNotice, LoadingNotice } from './socket-panel';
import styles from './terminal.module.css';

/**
 * ACCOUNT EQUITY — self-only ledger projection via `/api/v1/account/balance`.
 *
 * Empty `balances: {}` is honest (no assets), not a loading failure. Unsigned
 * sessions see the sign-in prompt rather than invented zeros.
 */

const copy = {
  title: 'Account equity',
  loading: 'Reading balances…',
  empty: 'No balances on this account',
  signIn: 'Sign in to load equity',
  columns: { asset: 'Asset', free: 'Free', used: 'Used', total: 'Total' },
} as const;

const columns: DataTableColumn[] = [
  { key: 'asset', label: copy.columns.asset },
  { key: 'free', label: copy.columns.free, align: 'right', numeric: true },
  { key: 'used', label: copy.columns.used, align: 'right', numeric: true },
  { key: 'total', label: copy.columns.total, align: 'right', numeric: true },
];

type EquityState =
  | { readonly status: 'anonymous' }
  | { readonly status: 'loading' }
  | { readonly status: 'empty' }
  | { readonly status: 'live'; readonly data: AccountBalances }
  | { readonly status: 'failed'; readonly failure: Failure };

function toRows(data: AccountBalances): DataTableRow[] {
  return Object.keys(data.balances)
    .sort()
    .map((asset) => {
      const row = data.balances[asset]!;
      return {
        id: asset,
        cells: { asset, free: row.free, used: row.used, total: row.total },
      };
    });
}

export function AccountEquity() {
  const edge = useEdge();
  const session = useSession();
  const signedIn = session.status === 'authenticated';
  const [state, setState] = useState<EquityState>({ status: signedIn ? 'loading' : 'anonymous' });

  const load = useCallback(async () => {
    if (!signedIn) {
      setState({ status: 'anonymous' });
      return;
    }
    setState({ status: 'loading' });
    const result = await fetchAccountBalance(edge, true);
    if (!result.ok) {
      setState({ status: 'failed', failure: result });
      return;
    }
    if (Object.keys(result.value.balances).length === 0) {
      setState({ status: 'empty' });
      return;
    }
    setState({ status: 'live', data: result.value });
  }, [edge, signedIn]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Panel title={copy.title} live={state.status === 'live'}>
      {state.status === 'anonymous' && <p className={styles.socketReason}>{copy.signIn}</p>}
      {state.status === 'loading' && <LoadingNotice label={copy.loading} />}
      {state.status === 'empty' && <p className={styles.socketReason}>{copy.empty}</p>}
      {state.status === 'failed' && (
        <>
          <FailureNotice failure={state.failure} />
          <span className={styles.srOnly}>{describeFailure(state.failure)}</span>
        </>
      )}
      {state.status === 'live' && <DataTable columns={columns} rows={toRows(state.data)} />}
    </Panel>
  );
}
