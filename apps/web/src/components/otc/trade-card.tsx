'use client';

import { useState } from 'react';
import { actionsFor, custodyOf, describeStatus, isSettlementPending, roleOf, type OtcAction } from '@/lib/otc/desk';
import type { OtcTrade } from '@/lib/api/wire';
import { describeFailure, type Failure } from '@/lib/result';
import styles from './otc.module.css';

/**
 * ONE TRADE, WITH ITS CUSTODY STATED ON THE FACE OF IT.
 *
 * The custody line is not decoration and it is not reassurance — it is the
 * answer to "if everything stops right now, where is my money and how do I get
 * it back", rendered next to the money it is about. svc-p2p already guarantees
 * the answer (sweeps, idempotent recipes, a resolution column the database will
 * only let you write once). This component is the part that lets the user
 * *know* it, which is the difference between a guarantee and a support ticket.
 *
 * Every irreversible action confirms, and the confirmation names the amount and
 * asset that will move. "Are you sure?" is not a confirmation; "release 250.5
 * USDT to the buyer, permanently" is.
 */

const copy = {
  escrow: 'Escrow',
  ifNobodyActs: 'If nobody acts',
  settling: 'Settling — the decision is recorded and the ledger post is being retried. Your funds are late, not lost.',
  deadline: 'Deadline',
  confirm: 'Confirm',
  cancelConfirm: 'Back',
  working: 'Working…',
  disputeReason: 'Why are you opening this dispute?',
  disputePlaceholder: 'What happened, and what evidence do you have?',
  counterparty: 'Counterparty',
  youAre: 'You are the',
} as const;

export interface TradeCardProps {
  readonly trade: OtcTrade;
  readonly userId: string | null;
  readonly busy: boolean;
  readonly failure: Failure | null;
  onAct(action: OtcAction, trade: OtcTrade, reason?: string): void;
}

export function TradeCard({ trade, userId, busy, failure, onAct }: TradeCardProps) {
  const role = roleOf(trade, userId);
  const custody = custodyOf(trade);
  const actions = actionsFor(trade, role);
  const [pending, setPending] = useState<OtcAction | null>(null);
  const [disputeReason, setDisputeReason] = useState('');

  const pendingOffer = actions.find((a) => a.action === pending) ?? null;

  return (
    <article className={styles.tradeCard} data-status={trade.status}>
      <header className={styles.tradeHead}>
        <div>
          <p className={styles.tradeAmount}>
            <span className="if-numeric">
              {trade.amount} {trade.asset}
            </span>
            <span className={styles.tradeFor}>for</span>
            <span className="if-numeric">
              {trade.fiatAmount} {trade.fiatCurrency}
            </span>
          </p>
          <p className={styles.tradeMeta}>
            <span className={styles.statusPill} data-status={trade.status}>
              {describeStatus(trade)}
            </span>
            {role ? (
              <span className={styles.roleTag}>
                {copy.youAre} {role}
              </span>
            ) : null}
            <span className="if-numeric">{trade.method}</span>
          </p>
        </div>
        {trade.deadlineAt ? (
          <p className={styles.deadline}>
            <span className={styles.deadlineLabel}>{copy.deadline}</span>
            <time className="if-numeric" dateTime={trade.deadlineAt}>
              {new Date(trade.deadlineAt).toISOString().replace('T', ' ').slice(0, 19)}Z
            </time>
          </p>
        ) : null}
      </header>

      {/* The stranding answer. Always rendered, in every state. */}
      <div className={styles.custody} data-custody={custody.custody}>
        <p className={styles.custodyWhere}>
          <span className={styles.custodyLabel}>{copy.escrow}</span>
          {custody.where}
        </p>
        <p className={styles.custodyNext}>
          <span className={styles.custodyLabel}>{copy.ifNobodyActs}</span>
          {custody.ifNobodyActs}
        </p>
      </div>

      {isSettlementPending(trade) ? <p className={styles.settling}>{copy.settling}</p> : null}

      {failure ? <p className={styles.tradeFailure}>{describeFailure(failure)}</p> : null}

      {actions.length > 0 ? (
        <div className={styles.actions}>
          {pendingOffer ? (
            <div className={styles.confirmBox}>
              <p className={styles.confirmText} data-irreversible={pendingOffer.irreversible}>
                {pendingOffer.consequence}
              </p>

              {pendingOffer.action === 'openDispute' ? (
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{copy.disputeReason}</span>
                  <textarea
                    className={styles.textarea}
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder={copy.disputePlaceholder}
                    rows={3}
                    maxLength={2000}
                  />
                </label>
              ) : null}

              <div className={styles.confirmRow}>
                <button
                  type="button"
                  className={styles.confirmButton}
                  data-irreversible={pendingOffer.irreversible}
                  disabled={busy || (pendingOffer.action === 'openDispute' && disputeReason.trim().length === 0)}
                  onClick={() => {
                    onAct(pendingOffer.action, trade, pendingOffer.action === 'openDispute' ? disputeReason.trim() : undefined);
                    setPending(null);
                    setDisputeReason('');
                  }}
                >
                  {busy ? copy.working : `${copy.confirm}: ${pendingOffer.label}`}
                </button>
                <button type="button" className={styles.ghostButton} onClick={() => setPending(null)} disabled={busy}>
                  {copy.cancelConfirm}
                </button>
              </div>
            </div>
          ) : (
            actions.map((offer) => (
              <button
                key={offer.action}
                type="button"
                className={styles.actionButton}
                data-irreversible={offer.irreversible}
                disabled={busy}
                onClick={() => setPending(offer.action)}
              >
                {offer.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </article>
  );
}
