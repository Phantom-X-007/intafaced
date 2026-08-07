import { describe, expect, it } from 'vitest';
import { SUPPORT_MONEY_TOOLS } from './guardrail.js';
import {
  invokeSupportDataTool,
  isSupportDataToolOk,
  supportAnswerOrEscalate,
  SUPPORT_DATA_TOOLS,
  type AccountProjectionFixture,
  type KbArticleFixture,
  type TicketFixture,
} from './data-tools.js';
import type { SupportTierLaw } from './tier-gate.js';

const USER = 'user-1';
const OTHER = 'user-2';

const law: SupportTierLaw = { published: true, matrix: { free: [...SUPPORT_DATA_TOOLS] } };

const articles: readonly KbArticleFixture[] = [
  { articleKey: 'kb.withdrawals.delayed', titleKey: 'kb.withdrawals.delayed.title', bodyKey: 'kb.withdrawals.delayed.body' },
];

const ticket: TicketFixture = { ticketId: 'tkt-1', ownerUserId: USER, status: 'open', category: 'withdrawals' };

const account: AccountProjectionFixture = { userId: USER, status: 'frozen', kycTier: 'tier-2' };

/** Everything an open call needs, so each test can vary exactly one thing. */
function call(overrides: Partial<Parameters<typeof invokeSupportDataTool>[0]> = {}) {
  return invokeSupportDataTool({
    tool: 'support.kb.search',
    plane: 'live',
    requesterUserId: USER,
    tierLaw: law,
    userTier: 'free',
    articles,
    ticket,
    account,
    ...overrides,
  });
}

describe('support Stage-2 data tools — nothing is invented', () => {
  it('refuses every money tool by name, before any plane or tier work', () => {
    for (const tool of SUPPORT_MONEY_TOOLS) {
      expect(call({ tool }), tool).toEqual({
        status: 'refuse',
        tool,
        reason: 'money_tool',
        userMessageKey: 'agents.support.unavailable',
      });
    }
  });

  it('a dark desk plane refuses instead of answering from memory', () => {
    expect(call({ plane: 'dark' })).toMatchObject({ reason: 'desk_plane_dark', userMessageKey: 'agents.support.unavailable' });
  });

  it('blank tier law refuses closed — no default grant', () => {
    expect(call({ tierLaw: null })).toMatchObject({ reason: 'tier_law_blank', userMessageKey: 'agents.support.tier_closed' });
    expect(call({ userTier: '' })).toMatchObject({ reason: 'tier_not_granted' });
  });

  it('an undeclared tool refuses even when the tier matrix names it', () => {
    expect(
      call({ tool: 'support.ticket.delete', tierLaw: { published: true, matrix: { free: ['support.ticket.delete'] } } }),
    ).toMatchObject({ reason: 'tool_not_declared' });
  });

  it('a declared tool outside the tier refuses as tier-closed', () => {
    expect(call({ tool: 'support.ticket.read', tierLaw: { published: true, matrix: { free: ['support.kb.search'] } } })).toMatchObject({
      reason: 'tool_not_in_tier',
      userMessageKey: 'agents.support.tier_closed',
    });
  });

  it('refuses without a requester — the door is never optional', () => {
    expect(call({ requesterUserId: '  ' })).toMatchObject({ reason: 'missing_requester' });
  });
});

describe('support Stage-2 kb.search', () => {
  it('echoes the caller article keys and invents none', () => {
    const result = call();
    expect(isSupportDataToolOk(result)).toBe(true);
    expect(result).toEqual({ status: 'ok', tool: 'support.kb.search', articles });
  });

  it('no hit is a refusal, not an improvised answer', () => {
    expect(call({ articles: [] })).toMatchObject({ reason: 'empty_results' });
    expect(call({ articles: null })).toMatchObject({ reason: 'empty_results' });
  });

  it('refuses rendered prose where an i18n key belongs', () => {
    expect(call({ articles: [{ articleKey: 'Your withdrawal is delayed', titleKey: 'kb.a.title', bodyKey: 'kb.a.body' }] })).toMatchObject({
      reason: 'incomplete_article',
    });
  });
});

describe('support Stage-2 ticket.read — ownership at the door', () => {
  const read = (o: Partial<Parameters<typeof invokeSupportDataTool>[0]> = {}) => call({ tool: 'support.ticket.read', ...o });

  it('reads the requester’s own ticket', () => {
    expect(read()).toEqual({ status: 'ok', tool: 'support.ticket.read', ticket });
  });

  it('refuses another user’s ticket — a guessable id is not a grant', () => {
    expect(read({ ticket: { ...ticket, ownerUserId: OTHER } })).toMatchObject({ reason: 'not_ticket_owner' });
  });

  it('refuses a missing or half-filled ticket', () => {
    expect(read({ ticket: null })).toMatchObject({ reason: 'missing_fixture' });
    expect(read({ ticket: { ...ticket, category: '' } })).toMatchObject({ reason: 'incomplete_ticket' });
    expect(read({ ticket: { ...ticket, ownerUserId: '' } })).toMatchObject({ reason: 'incomplete_ticket' });
  });
});

describe('support Stage-2 account.read — status only, never a balance', () => {
  const read = (o: Partial<Parameters<typeof invokeSupportDataTool>[0]> = {}) => call({ tool: 'identity.account.read', ...o });

  it('returns status and KYC tier and no other field', () => {
    const result = read();
    expect(result).toEqual({ status: 'ok', tool: 'identity.account.read', account });
    expect(Object.keys(result.status === 'ok' && result.tool === 'identity.account.read' ? result.account : {})).toEqual([
      'userId',
      'status',
      'kycTier',
    ]);
  });

  it('refuses another user’s account projection', () => {
    expect(read({ account: { ...account, userId: OTHER } })).toMatchObject({ reason: 'account_owner_mismatch' });
  });

  it('refuses a missing or half-filled projection', () => {
    expect(read({ account: null })).toMatchObject({ reason: 'missing_fixture' });
    expect(read({ account: { ...account, kycTier: '' } })).toMatchObject({ reason: 'incomplete_account' });
  });
});

describe('support Stage-2 escalate path', () => {
  it('answers only when the KB actually hit, citing what it read', () => {
    expect(supportAnswerOrEscalate({ kbResult: call() })).toEqual({
      status: 'answer',
      citedArticleKeys: ['kb.withdrawals.delayed'],
    });
  });

  it('an empty KB escalates to a person', () => {
    expect(supportAnswerOrEscalate({ kbResult: call({ articles: [] }) })).toEqual({
      status: 'escalate',
      reason: 'kb_no_hit',
      userMessageKey: 'agents.support.escalated',
    });
  });

  it('any other desk refusal escalates rather than guessing', () => {
    expect(supportAnswerOrEscalate({ kbResult: call({ plane: 'dark' }) })).toMatchObject({ reason: 'desk_refused' });
  });

  it('a money request escalates even when the KB hit', () => {
    expect(supportAnswerOrEscalate({ kbResult: call(), moneyRequest: true })).toMatchObject({ reason: 'money_request' });
  });

  it('a non-KB read is never treated as an answer', () => {
    expect(supportAnswerOrEscalate({ kbResult: call({ tool: 'identity.account.read' }) })).toMatchObject({
      reason: 'desk_refused',
    });
  });
});
