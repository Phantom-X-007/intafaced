import { describe, expect, it } from 'vitest';
import {
  messageRoleCatalogBoardCard,
  messageRoleCatalogStatusLine,
  parseMessageRoleCatalogStatusLine,
  messageRoleCatalogStatusLineMatches,
  messageRoleCatalogStatusLineConsistent,
  chatMessageListBoardCard,
  chatMessageListStatusLine,
  parseChatMessageListStatusLine,
  chatMessageListStatusLineMatches,
  chatMessageListStatusLineConsistent,
  chatMessageListExportHeader,
  chatMessageListExportLine,
  chatMessageListExportText,
  isDeclaredMessageRole,
  MESSAGE_ROLES,
  type ChatMessageBoardInput,
} from './message-role-honesty.js';

describe('L3 wave108 message role honesty', () => {
  it('catalog and message list boards', () => {
    expect(MESSAGE_ROLES).toEqual(['user', 'assistant']);
    expect(messageRoleCatalogBoardCard()).toEqual({
      roles: 2,
      hasUser: 1,
      hasAssistant: 1,
      hasSystem: 0,
    });
    expect(messageRoleCatalogStatusLineMatches()).toBe(true);
    expect(messageRoleCatalogStatusLineConsistent(messageRoleCatalogStatusLine())).toBe(true);
    expect(isDeclaredMessageRole('user')).toBe(true);
    expect(isDeclaredMessageRole('system')).toBe(false);
    expect(parseMessageRoleCatalogStatusLine('nope')).toBeNull();

    const msgs: readonly ChatMessageBoardInput[] = [
      { role: 'user', contentLen: 10 },
      { role: 'assistant', contentLen: 20 },
      { role: 'user', contentLen: 5 },
    ];
    expect(chatMessageListBoardCard(msgs)).toEqual({
      messages: 3,
      user: 2,
      assistant: 1,
      totalChars: 35,
    });
    expect(chatMessageListStatusLine(msgs)).toBe('messages=3 user=2 assistant=1 chars=35');
    expect(chatMessageListStatusLineMatches(msgs)).toBe(true);
    expect(chatMessageListStatusLineConsistent(chatMessageListStatusLine(msgs))).toBe(true);
    expect(chatMessageListExportText(msgs).startsWith(chatMessageListExportHeader())).toBe(true);
    expect(chatMessageListExportLine(msgs)).toBe('3,2,1,35');
    expect(parseChatMessageListStatusLine('nope')).toBeNull();
  });
});
