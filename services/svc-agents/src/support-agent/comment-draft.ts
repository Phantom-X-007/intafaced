/**
 * Support agent L3 — pure ticket comment draft gate (Stage-2 write path).
 *
 * Builds a comment payload only when ticket id + body are real.
 * Never invents refund amounts, balance claims, or empty “helpful” replies.
 * Money-tool execution stays banned by guardrail; this only shapes text.
 */

export type CommentDraftOk = {
  readonly status: 'ok';
  readonly ticketId: string;
  readonly body: string;
};

export type CommentDraftRefuse = {
  readonly status: 'refuse';
  readonly reason: 'missing_ticket' | 'empty_body' | 'body_too_long' | 'money_invent_language';
  readonly userMessageKey: 'agents.support.comment_refused';
};

export type CommentDraftResult = CommentDraftOk | CommentDraftRefuse;

const MAX_BODY = 4_000;

/** Language that pretends to move value or invent balances — refuse. */
const MONEY_INVENT = /\b(i (have )?refunded|balance (is|now) \d|credited \$?\d|wired \$?\d|sent you \$?\d|payout of)\b/i;

/**
 * Pure draft for support.ticket.comment. Caller still needs guardrail approval.
 */
export function draftTicketComment(input: { ticketId: string | null | undefined; body: string | null | undefined }): CommentDraftResult {
  const ticketId = input.ticketId?.trim() ?? '';
  if (!ticketId) {
    return { status: 'refuse', reason: 'missing_ticket', userMessageKey: 'agents.support.comment_refused' };
  }
  const body = input.body?.trim() ?? '';
  if (body.length < 1) {
    return { status: 'refuse', reason: 'empty_body', userMessageKey: 'agents.support.comment_refused' };
  }
  if (body.length > MAX_BODY) {
    return { status: 'refuse', reason: 'body_too_long', userMessageKey: 'agents.support.comment_refused' };
  }
  if (MONEY_INVENT.test(body)) {
    return { status: 'refuse', reason: 'money_invent_language', userMessageKey: 'agents.support.comment_refused' };
  }
  return { status: 'ok', ticketId, body };
}
