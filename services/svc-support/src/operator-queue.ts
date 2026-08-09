/**
 * Support Stage-2 — operator queue (TRK-ops.support).
 *
 * Pure prioritisation of open tickets for operator desks. No money tools,
 * no ledger, no invent SLAs as currency.
 *
 * Priority = category weight + age band (older open tickets first within band).
 */

import type { SupportTicket, SupportTicketStatus } from '@intafaced/contracts';

/** Higher = more urgent. Product may retune; defaults are checkable. */
export const CATEGORY_WEIGHT: Readonly<Record<string, number>> = {
  account: 40,
  trading: 30,
  deposit_withdraw: 70,
  other: 10,
};

export type QueueEntry = {
  readonly ticketId: string;
  readonly userId: string;
  readonly category: string;
  readonly status: SupportTicketStatus;
  readonly subject: string;
  readonly score: number;
  readonly ageMs: number;
  readonly createdAt: string;
};

export type QueueResult = { readonly status: 'ok'; readonly entries: readonly QueueEntry[] } | { readonly status: 'empty' };

/**
 * Build operator queue from tickets. Only **unassigned** `open` / `pending`
 * are queued.
 *
 * Claim is exclusive (`already_claimed` refuse). That exclusivity is hollow if
 * the shared queue keeps ranking a ticket another operator already owns —
 * every peer "next"s the same row, thrash-refuses, and free work sits under it.
 * Assigned tickets leave this list; operators reach their own work via listAll
 * / get, not via a second "fair" path that invents steal pressure.
 *
 * Score = category weight + min(ageHours, 72) so age helps without inventing urgency.
 */
export function buildOperatorQueue(tickets: readonly SupportTicket[], options: { now?: Date; limit?: number } = {}): QueueResult {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const limit = options.limit ?? 100;
  const entries: QueueEntry[] = [];

  for (const t of tickets) {
    if (t.status !== 'open' && t.status !== 'pending') continue;
    // Fair claim: exclusive ownership leaves the shared queue.
    if (t.assigneeId) continue;
    const createdMs = Date.parse(t.createdAt);
    const ageMs = Number.isFinite(createdMs) ? Math.max(0, nowMs - createdMs) : 0;
    const ageHours = Math.floor(ageMs / 3_600_000);
    const cat = CATEGORY_WEIGHT[t.category] ?? CATEGORY_WEIGHT.other ?? 10;
    const score = cat + Math.min(ageHours, 72);
    entries.push({
      ticketId: t.id,
      userId: t.userId,
      category: t.category,
      status: t.status,
      subject: t.subject,
      score,
      ageMs,
      createdAt: t.createdAt,
    });
  }

  if (entries.length === 0) return { status: 'empty' };

  entries.sort((a, b) => b.score - a.score || a.createdAt.localeCompare(b.createdAt));
  return { status: 'ok', entries: entries.slice(0, limit) };
}

/**
 * Pick the next ticket for an operator. Does not invent priority — uses queue order.
 * Empty queue → null (not a fabricated ticket).
 */
export function assignNext(
  tickets: readonly SupportTicket[],
  options: { now?: Date; excludeTicketIds?: ReadonlySet<string> } = {},
): QueueEntry | null {
  const q = buildOperatorQueue(tickets, { now: options.now });
  if (q.status === 'empty') return null;
  const exclude = options.excludeTicketIds;
  for (const e of q.entries) {
    if (exclude && exclude.has(e.ticketId)) continue;
    return e;
  }
  return null;
}

export type ClaimOk = {
  readonly status: 'ok';
  readonly ticket: SupportTicket;
};

export type ClaimRefuse = {
  readonly status: 'refuse';
  readonly reason: 'not_found' | 'not_queueable' | 'already_claimed' | 'invalid_operator';
};

export type ClaimResult = ClaimOk | ClaimRefuse;

/**
 * Pure exclusive claim: only open/pending unassigned tickets can be claimed.
 * Already assigned to another operator → refuse (no steal invent).
 * Same operator re-claim → ok (idempotent).
 */
export function claimTicket(input: { tickets: readonly SupportTicket[]; ticketId: string; operatorId: string; now?: Date }): ClaimResult {
  const operatorId = input.operatorId?.trim() ?? '';
  if (!operatorId) return { status: 'refuse', reason: 'invalid_operator' };
  const ticket = input.tickets.find((t) => t.id === input.ticketId);
  if (!ticket) return { status: 'refuse', reason: 'not_found' };
  if (ticket.status !== 'open' && ticket.status !== 'pending') {
    return { status: 'refuse', reason: 'not_queueable' };
  }
  if (ticket.assigneeId && ticket.assigneeId !== operatorId) {
    return { status: 'refuse', reason: 'already_claimed' };
  }
  const now = (input.now ?? new Date()).toISOString();
  return {
    status: 'ok',
    ticket: {
      ...ticket,
      assigneeId: operatorId,
      status: ticket.status === 'open' ? 'pending' : ticket.status,
      updatedAt: now,
    },
  };
}
