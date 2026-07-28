'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { KycTierValue } from '@intafaced/contracts/identity';
import { createEdgeClient, DEFAULT_EDGE_URL, type EdgeClient } from './api/edge-client';
import { kycStatus, login as loginCall, logout as logoutCall } from './api/services';
import type { Failure } from './result';
import { FIAT_PLANE, planeById, type PlaneDefinition, type PlaneId } from './plane';

/**
 * SESSION AND PLANE — the two pieces of state the whole terminal reads.
 *
 * ── Where the token lives, and why ─────────────────────────────────────────
 *
 * In memory. Not `localStorage`, not a non-httpOnly cookie: both are readable
 * by any script that gets onto the page, and this token is the thing svc-edge
 * exchanges for a signed principal — i.e. it is authority over a custodial
 * account. The cost is honest and visible: a page reload signs you out.
 *
 * The fix is a refresh token in an httpOnly cookie set by a route handler, and
 * it is deliberately NOT faked here. `auth.refresh` exists on svc-identity and
 * this app does not call it on boot, because there is nothing to call it with.
 * That is a §13 socket, stated in the sign-in panel rather than hidden.
 *
 * ── Why the token is read through a ref ────────────────────────────────────
 *
 * `createEdgeClient` takes a `TokenSource` it calls per request. If the client
 * were rebuilt whenever the token changed, every in-flight request would be
 * orphaned on sign-in; if the token were captured at construction, sign-out
 * would not stop it being sent. A ref is neither.
 */

export interface SessionState {
  readonly status: 'anonymous' | 'signing-in' | 'authenticated';
  readonly userId: string | null;
  /** Verification tier, as svc-identity computes it. `null` = not asked yet. */
  readonly tier: KycTierValue | null;
  /** Why the last sign-in failed. Rendered verbatim. */
  readonly failure: Failure | null;
  /** Why the tier could not be read, if it could not. Never assumed to be `none`. */
  readonly tierFailure: Failure | null;
}

export interface SessionApi extends SessionState {
  signIn(identifier: string, password: string, totpCode?: string): Promise<void>;
  signOut(): Promise<void>;
}

const ANONYMOUS: SessionState = { status: 'anonymous', userId: null, tier: null, failure: null, tierFailure: null };

interface TerminalContextValue {
  readonly edge: EdgeClient;
  /**
   * The same edge, with no token source at all.
   *
   * §22 says the Protocol Plane is permissionless because there is nothing to
   * KYC. A plane that still receives your session bearer on every call is not
   * permissionless in any sense a user would recognise — the platform would
   * learn exactly which identity derived which address. `predictAddress` and
   * `health` need no authority, so they are sent with none.
   */
  readonly anonymousEdge: EdgeClient;
  readonly session: SessionApi;
  readonly plane: PlaneDefinition;
  setPlane(id: PlaneId): void;
}

const TerminalContext = createContext<TerminalContextValue | null>(null);

export function TerminalProviders({ children, edgeUrl }: { children: ReactNode; edgeUrl?: string }) {
  const accessToken = useRef<string | null>(null);
  const refreshToken = useRef<string | null>(null);
  const [session, setSession] = useState<SessionState>(ANONYMOUS);
  const [planeId, setPlaneId] = useState<PlaneId>(FIAT_PLANE.id);

  const edge = useMemo(() => createEdgeClient({ baseUrl: edgeUrl ?? DEFAULT_EDGE_URL, token: () => accessToken.current }), [edgeUrl]);

  const anonymousEdge = useMemo(() => createEdgeClient({ baseUrl: edgeUrl ?? DEFAULT_EDGE_URL }), [edgeUrl]);

  const signIn = useCallback(
    async (identifier: string, password: string, totpCode?: string) => {
      setSession({ ...ANONYMOUS, status: 'signing-in' });

      const result = await loginCall(edge, totpCode ? { identifier, password, totpCode } : { identifier, password });
      if (!result.ok) {
        setSession({ ...ANONYMOUS, failure: result });
        return;
      }

      accessToken.current = result.value.accessToken;
      refreshToken.current = result.value.refreshToken;

      // The tier is fetched immediately because it decides what the custodial
      // plane will let this session do. A failure to read it is NOT treated as
      // `none`: an unknown tier greys the ticket with "tier unknown", never
      // enables it on an optimistic guess.
      const tier = await kycStatus(edge);
      setSession({
        status: 'authenticated',
        userId: result.value.userId,
        tier: tier.ok ? tier.value.tier : null,
        failure: null,
        tierFailure: tier.ok ? null : tier,
      });
    },
    [edge],
  );

  const signOut = useCallback(async () => {
    const token = refreshToken.current;
    accessToken.current = null;
    refreshToken.current = null;
    setSession(ANONYMOUS);
    // Best effort: the local session is already gone either way, and a failed
    // revoke must not leave the UI claiming the user is still signed in.
    if (token) await logoutCall(edge, token);
  }, [edge]);

  const value = useMemo<TerminalContextValue>(
    () => ({
      edge,
      anonymousEdge,
      session: { ...session, signIn, signOut },
      plane: planeById(planeId),
      setPlane: setPlaneId,
    }),
    [edge, anonymousEdge, session, signIn, signOut, planeId],
  );

  return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>;
}

function useTerminal(): TerminalContextValue {
  const ctx = useContext(TerminalContext);
  if (!ctx) throw new Error('useTerminal must be used inside <TerminalProviders>');
  return ctx;
}

export function useEdge(): EdgeClient {
  return useTerminal().edge;
}

/** For permissionless calls only. Sends no bearer, ever. */
export function useAnonymousEdge(): EdgeClient {
  return useTerminal().anonymousEdge;
}

export function useSession(): SessionApi {
  return useTerminal().session;
}

export function usePlane(): { plane: PlaneDefinition; setPlane: (id: PlaneId) => void } {
  const { plane, setPlane } = useTerminal();
  return { plane, setPlane };
}
