'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Failure, Result } from './result';

/**
 * A service call, as three states a component must handle.
 *
 * There is no fourth state carrying stale data, and `value` is unreachable
 * unless `status === 'ok'`. That is what stops the standard bug: a component
 * that keeps the last successful response on screen after the service went
 * away, so the screen says one thing and the platform says another.
 *
 * `gated` is separate from `failed` on purpose. "You are not signed in" is not
 * an error — it is the correct answer to a question this session may not ask,
 * and it should render as an invitation rather than as a red panel.
 */
export type Load<T> =
  | { readonly status: 'idle'; readonly reason: string }
  | { readonly status: 'loading' }
  | { readonly status: 'ok'; readonly value: T }
  | { readonly status: 'failed'; readonly failure: Failure };

export interface Loaded<T> {
  readonly state: Load<T>;
  reload(): void;
}

/**
 * Run `call` and expose the result.
 *
 * `call` returning `null` means "do not ask" — no session, no market selected —
 * and lands in `idle` with the reason on screen. `key` is the dependency: it
 * changes when the question changes.
 */
export function useService<T>(call: (() => Promise<Result<T>>) | null, key: string, idleReason = 'Not requested'): Loaded<T> {
  const [state, setState] = useState<Load<T>>(call ? { status: 'loading' } : { status: 'idle', reason: idleReason });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!call) {
      setState({ status: 'idle', reason: idleReason });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    void call().then((result) => {
      if (cancelled) return;
      setState(result.ok ? { status: 'ok', value: result.value } : { status: 'failed', failure: result });
    });

    return () => {
      cancelled = true;
    };
    // `key` is the identity of the question. Depending on `call` itself would
    // re-run on every render, because a new closure is a new value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce, idleReason]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { state, reload };
}
