'use client';

import { useState, type FormEvent } from 'react';
import { Panel } from '@intafaced/ui';
import { useSession } from '@/lib/providers';
import { describeFailure } from '@/lib/result';
import styles from './terminal.module.css';

/**
 * SIGN IN — svc-identity `auth.login`, through the edge.
 *
 * Only the Fiat Plane needs this. The Protocol Plane does not render it at all,
 * which is the point of §22 expressed as an absence: there is no login on a
 * plane where the platform holds nothing.
 *
 * ── The two limits stated on screen rather than hidden ─────────────────────
 *
 * 1. The session lives in memory. A reload signs you out, because the
 *    alternative — a token in `localStorage` — is authority over a custodial
 *    account, readable by any script that reaches the page. The httpOnly-cookie
 *    refresh flow is a §13 socket.
 * 2. `auth.register` is behind svc-identity's `registrationOpen` flag and is
 *    not surfaced here. An account has to exist already.
 */

const copy = {
  title: 'Session',
  identifier: 'Handle or email',
  password: 'Password',
  totp: 'TOTP code (if enrolled)',
  submit: 'Sign in',
  signingIn: 'Signing in…',
  signOut: 'Sign out',
  signedInAs: 'Signed in',
  tier: 'Verification tier',
  tierUnknown: 'could not be read',
  memoryNote: 'Held in memory only — a page reload signs you out. Refresh-token persistence is not built.',
} as const;

export function SignInPanel() {
  const session = useSession();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (session.status === 'signing-in') return;
    await session.signIn(identifier, password, totpCode.trim() === '' ? undefined : totpCode.trim());
  }

  if (session.status === 'authenticated') {
    return (
      <Panel title={copy.title}>
        <div className={styles.sessionBox}>
          <div className={styles.summary}>
            <span className={styles.fieldLabel}>{copy.signedInAs}</span>
            <span className="if-numeric">{session.userId?.slice(0, 8)}</span>
          </div>
          <div className={styles.summary}>
            <span className={styles.fieldLabel}>{copy.tier}</span>
            <span className="if-numeric" data-unknown={session.tier === null}>
              {session.tier ?? copy.tierUnknown}
            </span>
          </div>
          {session.tierFailure && <span className={styles.ticketFailure}>{describeFailure(session.tierFailure)}</span>}
          <button type="button" className={styles.submit} onClick={() => void session.signOut()}>
            {copy.signOut}
          </button>
          <span className={styles.pending}>{copy.memoryNote}</span>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={copy.title}>
      <form className={styles.ticket} onSubmit={onSubmit}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{copy.identifier}</span>
          <input className={styles.input} autoComplete="username" value={identifier} onChange={(e) => setIdentifier(e.target.value)} />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>{copy.password}</span>
          <input
            className={styles.input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>{copy.totp}</span>
          <input
            className={`${styles.input} if-numeric`}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
          />
        </label>

        <button type="submit" className={styles.submit} disabled={session.status === 'signing-in' || identifier === '' || password === ''}>
          {session.status === 'signing-in' ? copy.signingIn : copy.submit}
        </button>

        {session.failure && <span className={styles.ticketFailure}>{describeFailure(session.failure)}</span>}
        <span className={styles.pending}>{copy.memoryNote}</span>
      </form>
    </Panel>
  );
}
