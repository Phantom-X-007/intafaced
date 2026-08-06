/**
 * Agents L3 — pure chat message role catalog honesty (no model I/O).
 *
 * Mirrors provider.ts MessageRole. No vendor names.
 */

export const MESSAGE_ROLES = ['user', 'assistant'] as const;
export type MessageRoleId = (typeof MESSAGE_ROLES)[number];

export type ChatMessageBoardInput = {
  readonly role: MessageRoleId;
  readonly contentLen: number;
};

/** L3 — catalog board. */
export function messageRoleCatalogBoardCard(): {
  readonly roles: number;
  readonly hasUser: number;
  readonly hasAssistant: number;
  readonly hasSystem: number;
} {
  return {
    roles: MESSAGE_ROLES.length,
    hasUser: MESSAGE_ROLES.includes('user') ? 1 : 0,
    hasAssistant: MESSAGE_ROLES.includes('assistant') ? 1 : 0,
    hasSystem: 0,
  };
}

/** L3 — catalog status line. */
export function messageRoleCatalogStatusLine(): string {
  const c = messageRoleCatalogBoardCard();
  return `roles=${c.roles} user=${c.hasUser} assistant=${c.hasAssistant} system=${c.hasSystem}`;
}

/** L3 — parse catalog. */
export function parseMessageRoleCatalogStatusLine(line: string): {
  readonly roles: number;
  readonly user: number;
  readonly assistant: number;
  readonly system: number;
} | null {
  const m = line.trim().match(/^roles=(\d+) user=([01]) assistant=([01]) system=([01])$/);
  if (!m) return null;
  return {
    roles: Number(m[1]),
    user: Number(m[2]),
    assistant: Number(m[3]),
    system: Number(m[4]),
  };
}

/** L3 — true when catalog matches. */
export function messageRoleCatalogStatusLineMatches(): boolean {
  const p = parseMessageRoleCatalogStatusLine(messageRoleCatalogStatusLine());
  if (!p) return false;
  const c = messageRoleCatalogBoardCard();
  return p.roles === c.roles && p.user === c.hasUser && p.assistant === c.hasAssistant && p.system === c.hasSystem;
}

/** L3 — no system role on this interface. */
export function messageRoleCatalogStatusLineConsistent(line: string): boolean {
  const p = parseMessageRoleCatalogStatusLine(line);
  if (!p) return false;
  return p.system === 0 && p.roles === 2;
}

/** L3 — message list board. */
export function chatMessageListBoardCard(messages: readonly ChatMessageBoardInput[]): {
  readonly messages: number;
  readonly user: number;
  readonly assistant: number;
  readonly totalChars: number;
} {
  let user = 0;
  let assistant = 0;
  let totalChars = 0;
  for (const m of messages) {
    if (m.role === 'user') user += 1;
    else assistant += 1;
    totalChars += m.contentLen;
  }
  return { messages: messages.length, user, assistant, totalChars };
}

/** L3 — list status line. */
export function chatMessageListStatusLine(messages: readonly ChatMessageBoardInput[]): string {
  const c = chatMessageListBoardCard(messages);
  return `messages=${c.messages} user=${c.user} assistant=${c.assistant} chars=${c.totalChars}`;
}

/** L3 — parse list. */
export function parseChatMessageListStatusLine(line: string): {
  readonly messages: number;
  readonly user: number;
  readonly assistant: number;
  readonly chars: number;
} | null {
  const m = line.trim().match(/^messages=(\d+) user=(\d+) assistant=(\d+) chars=(\d+)$/);
  if (!m) return null;
  return {
    messages: Number(m[1]),
    user: Number(m[2]),
    assistant: Number(m[3]),
    chars: Number(m[4]),
  };
}

/** L3 — true when list status matches. */
export function chatMessageListStatusLineMatches(messages: readonly ChatMessageBoardInput[]): boolean {
  const p = parseChatMessageListStatusLine(chatMessageListStatusLine(messages));
  if (!p) return false;
  const c = chatMessageListBoardCard(messages);
  return p.messages === c.messages && p.user === c.user && p.assistant === c.assistant && p.chars === c.totalChars;
}

/** L3 — user+assistant equals messages. */
export function chatMessageListStatusLineConsistent(line: string): boolean {
  const p = parseChatMessageListStatusLine(line);
  if (!p) return false;
  return p.messages === p.user + p.assistant;
}

/** L3 — export header. */
export function chatMessageListExportHeader(): string {
  return 'messages,user,assistant,chars';
}

/** L3 — export line. */
export function chatMessageListExportLine(messages: readonly ChatMessageBoardInput[]): string {
  const c = chatMessageListBoardCard(messages);
  return `${c.messages},${c.user},${c.assistant},${c.totalChars}`;
}

/** L3 — full export. */
export function chatMessageListExportText(messages: readonly ChatMessageBoardInput[]): string {
  return [chatMessageListExportHeader(), chatMessageListExportLine(messages)].join('\n');
}

/** L3 — role declared. */
export function isDeclaredMessageRole(role: string): boolean {
  return (MESSAGE_ROLES as readonly string[]).includes(role);
}
