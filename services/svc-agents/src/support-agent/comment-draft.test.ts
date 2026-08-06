import { describe, expect, it } from 'vitest';
import { draftTicketComment } from './comment-draft.js';

describe('support agent L3 comment draft', () => {
  it('accepts a clean draft', () => {
    expect(draftTicketComment({ ticketId: 't-1', body: 'Please share the order id.' })).toEqual({
      status: 'ok',
      ticketId: 't-1',
      body: 'Please share the order id.',
    });
  });

  it('refuses missing ticket / empty body', () => {
    expect(draftTicketComment({ ticketId: '  ', body: 'hi' }).status).toBe('refuse');
    expect(draftTicketComment({ ticketId: 't-1', body: '   ' })).toMatchObject({
      status: 'refuse',
      reason: 'empty_body',
    });
  });

  it('refuses money-invent language', () => {
    const r = draftTicketComment({ ticketId: 't-1', body: 'I have refunded you already.' });
    expect(r).toMatchObject({ status: 'refuse', reason: 'money_invent_language' });
  });
});
