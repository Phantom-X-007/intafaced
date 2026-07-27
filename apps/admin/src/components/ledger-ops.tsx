'use client';

import { useMemo, useState } from 'react';
import { Panel, StatBlock } from '@intafaced/ui';
import { isEnabled, type Drop } from '@intafaced/config';
import { Chip } from '@/components/chip';
import { CRITICAL_FLAG_KEY } from '@/lib/flag-state';
import { freezeLedger, reconcileLedger, unfreezeLedger, type CommandIntent, type ReconcileReport } from '@/lib/operator-commands';

/**
 * LEDGER OPERATIONS — the `admin:treasury` surface of svc-ledger.
 *
 * The three procedures already exist on `services/svc-ledger/src/router.ts`.
 * Nothing here calls them: svc-ledger is not deployed and the console carries no
 * service credential, so every button records an intent and returns a clearly
 * marked simulated result (`src/lib/operator-commands.ts` holds the stubs and
 * the note on what live wiring replaces).
 *
 * Friction is proportional to blast radius:
 *   reconcile — read-only on the book. One click.
 *   unfreeze  — resumes value movement. One acknowledgement.
 *   freeze    — stops the platform. A written reason, a typed confirmation
 *               phrase, and an explicit acknowledgement, all three.
 */

const CONFIRM_PHRASE = 'FREEZE LEDGER';
const MIN_REASON_LENGTH = 12;

export interface LedgerOpsProps {
  drop: Drop;
  flagEnv: Record<string, string>;
}

export function LedgerOps({ drop, flagEnv }: LedgerOpsProps) {
  const postingFlag = useMemo(() => isEnabled(CRITICAL_FLAG_KEY, { drop, env: flagEnv }), [drop, flagEnv]);

  const [postingEnabled, setPostingEnabled] = useState(postingFlag);
  const [report, setReport] = useState<ReconcileReport | null>(null);
  const [intents, setIntents] = useState<CommandIntent[]>([]);

  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [resumeAcknowledged, setResumeAcknowledged] = useState(false);

  const trimmedReason = reason.trim();
  const reasonOk = trimmedReason.length >= MIN_REASON_LENGTH;
  const phraseOk = confirmation === CONFIRM_PHRASE;
  const canFreeze = postingEnabled && reasonOk && phraseOk && acknowledged;

  function log(intent: CommandIntent) {
    setIntents((prev) => [intent, ...prev].slice(0, 50));
  }

  function onFreeze() {
    if (!canFreeze) return;
    const result = freezeLedger({ reason: trimmedReason });
    log(result.intent);
    setPostingEnabled(result.simulated.postingEnabled);
    setReason('');
    setConfirmation('');
    setAcknowledged(false);
  }

  function onUnfreeze() {
    if (postingEnabled || !resumeAcknowledged) return;
    const result = unfreezeLedger();
    log(result.intent);
    setPostingEnabled(result.simulated.postingEnabled);
    setResumeAcknowledged(false);
  }

  function onReconcile() {
    const result = reconcileLedger();
    log(result.intent);
    setReport(result.simulated);
  }

  return (
    <>
      <div className="adm-pagehead">
        <div>
          <h1>Ledger operations</h1>
          <p>
            Freeze, unfreeze and reconcile — the operator procedures svc-ledger exposes under the <code>admin:treasury</code> scope. This
            console issues commands; it never computes a balance and never posts an entry.
          </p>
        </div>
      </div>

      <div className="adm-banner">
        <Chip tone="warn" dot>
          Not wired
        </Chip>
        svc-ledger is not deployed. Every button below records the operator&rsquo;s intent locally and returns a simulated result. Live
        wiring is a body-only change in <code>src/lib/operator-commands.ts</code>.
      </div>

      <Panel title="Posting status" className={postingEnabled ? undefined : 'adm-panel--danger'} live={postingEnabled}>
        <div className="adm-statrow">
          <StatBlock
            label="Posting (simulated)"
            value={postingEnabled ? 'ACCEPTING' : 'HALTED'}
            deltaLabel={postingEnabled ? 'value moves' : 'all value movement stopped'}
          />
          <StatBlock label={`${CRITICAL_FLAG_KEY} flag`} value={postingFlag ? 'on' : 'off'} deltaLabel={`resolved at drop ${drop}`} />
          <StatBlock label="Scope required" value="admin:treasury" />
          <StatBlock label="Intents recorded" value={intents.length} deltaLabel="none delivered" />
        </div>
      </Panel>

      <div className="adm-split">
        <div className="adm-stack">
          {/* ── FREEZE — the destructive one ─────────────────────────────── */}
          <Panel title="Freeze — halt all posting" className="adm-panel--danger" actions={<Chip tone="danger">Platform-wide</Chip>}>
            <div className="adm-stack">
              <div className="adm-callout" data-tone="danger">
                <strong>This stops the entire platform</strong>
                Every module moves value by posting to the ledger. A freeze halts trade fills, payouts, escrow releases, card
                authorisations, staking and settlement at once, for every user, with no warning. §4.2 makes it the correct response to a
                reconciliation mismatch — a book we cannot verify must stop accepting writes — and the wrong response to anything smaller.
              </div>

              <div className="adm-field">
                <label htmlFor="freeze-reason">Reason (recorded with the freeze, minimum {MIN_REASON_LENGTH} characters)</label>
                <textarea
                  id="freeze-reason"
                  className="adm-textarea"
                  value={reason}
                  disabled={!postingEnabled}
                  placeholder="e.g. reconciliation mismatch on IFC — snapshot vs replay diverged at tx 41,220"
                  onChange={(event) => setReason(event.target.value)}
                />
                <span className="adm-footnote">
                  {reasonOk ? (
                    <Chip tone="live">Reason accepted</Chip>
                  ) : (
                    <Chip tone="dark">
                      {trimmedReason.length} / {MIN_REASON_LENGTH} characters
                    </Chip>
                  )}{' '}
                  svc-ledger requires a non-empty reason. This console requires one that will still make sense to whoever reads the incident
                  record.
                </span>
              </div>

              <div className="adm-field">
                <label htmlFor="freeze-confirm">
                  Type <code>{CONFIRM_PHRASE}</code> to confirm
                </label>
                <input
                  id="freeze-confirm"
                  className="adm-input"
                  value={confirmation}
                  disabled={!postingEnabled}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </div>

              <label className="adm-check">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  disabled={!postingEnabled}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                <span>
                  I understand this halts all value movement platform-wide, immediately, and that resuming requires a separate deliberate
                  action.
                </span>
              </label>

              <div className="adm-inline">
                <button type="button" className="adm-btn" data-tone="danger" disabled={!canFreeze} onClick={onFreeze}>
                  Freeze ledger
                </button>
                {!postingEnabled && <Chip tone="danger">Already halted</Chip>}
              </div>
            </div>
          </Panel>

          {/* ── UNFREEZE ─────────────────────────────────────────────────── */}
          <Panel title="Unfreeze — resume posting">
            <div className="adm-stack">
              <p className="adm-desc">
                Resuming lets every module write to the book again. §4.2: do not resume on a book that has not reconciled clean — run
                reconcile first and read the report.
              </p>
              <label className="adm-check">
                <input
                  type="checkbox"
                  checked={resumeAcknowledged}
                  disabled={postingEnabled}
                  onChange={(event) => setResumeAcknowledged(event.target.checked)}
                />
                <span>Reconciliation is clean and the cause of the freeze is resolved.</span>
              </label>
              <div className="adm-inline">
                <button
                  type="button"
                  className="adm-btn"
                  data-tone="primary"
                  disabled={postingEnabled || !resumeAcknowledged}
                  onClick={onUnfreeze}
                >
                  Unfreeze ledger
                </button>
                {postingEnabled && <Chip tone="live">Already accepting</Chip>}
              </div>
            </div>
          </Panel>

          {/* ── RECONCILE ────────────────────────────────────────────────── */}
          <Panel title="Reconcile — snapshot + replay">
            <div className="adm-stack">
              <p className="adm-desc">
                Read-only on the ledger&rsquo;s side: replays the chain, recomputes balances and compares. A non-ok report is a freeze
                decision, not a warning.
              </p>
              <div className="adm-inline">
                <button type="button" className="adm-btn" onClick={onReconcile}>
                  Run reconcile
                </button>
              </div>

              {report && (
                <>
                  <div className="adm-inline">
                    <Chip tone={report.ok ? 'live' : 'danger'} dot>
                      {report.ok ? 'Balanced' : 'No result'}
                    </Chip>
                    <Chip tone="warn">Simulated</Chip>
                  </div>
                  <dl className="adm-kv">
                    <dt>Accounts checked</dt>
                    <dd>{report.accountsChecked}</dd>
                    <dt>Chain length</dt>
                    <dd>{report.chainLength}</dd>
                    <dt>Unbalanced assets</dt>
                    <dd>{report.unbalancedAssets.length === 0 ? 'none' : report.unbalancedAssets.join(', ')}</dd>
                  </dl>
                  <p className="adm-footnote">
                    Zeroes because nothing was asked. These fields are svc-ledger&rsquo;s real output shape and will carry real counts the
                    moment the client is wired — the console deliberately shows no invented numbers on a money screen.
                  </p>
                </>
              )}
            </div>
          </Panel>
        </div>

        {/* ── Intent log ─────────────────────────────────────────────────── */}
        <Panel title="Operator intent log" className="adm-flush">
          {intents.length === 0 ? (
            <p className="adm-empty">No commands issued in this session.</p>
          ) : (
            <ul className="adm-log">
              {intents.map((intent) => (
                <li key={intent.id} data-kind={intent.kind}>
                  <time dateTime={intent.at}>{intent.at.slice(11, 19)}</time>
                  <span>{intent.kind}</span>
                  <span>{intent.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
