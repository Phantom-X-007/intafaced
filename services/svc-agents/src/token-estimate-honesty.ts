/**
 * Agents L3 — pure token estimate honesty boards (no model I/O).
 *
 * Mirrors runtime estimateInputTokens heuristic as a pure count board.
 * Estimate is not a money figure — billing stays metering path.
 */

/**
 * L3 — same rough estimate used by runtime.ts: 3 chars per token, ceil.
 * Empty → 0 (never invent tokens). Over-estimate is intentional (ceiling safety).
 */
export function estimateInputTokensFromText(system: string | undefined, messages: readonly { content: string }[]): number {
  let chars = system?.length ?? 0;
  for (const m of messages) chars += m.content.length;
  if (chars <= 0) return 0;
  return Math.ceil(chars / 3);
}

export type TokenEstimateBoardInput = {
  readonly systemLen: number;
  readonly messageCount: number;
  readonly totalChars: number;
  readonly estimatedTokens: number;
};

/** L3 — board from estimate inputs. */
export function tokenEstimateBoardCard(input: { system?: string; messages: readonly { content: string }[] }): TokenEstimateBoardInput {
  const systemLen = input.system?.length ?? 0;
  let totalChars = systemLen;
  for (const m of input.messages) totalChars += m.content.length;
  return {
    systemLen,
    messageCount: input.messages.length,
    totalChars,
    estimatedTokens: estimateInputTokensFromText(input.system, input.messages),
  };
}

/** L3 — status line. */
export function tokenEstimateStatusLine(input: { system?: string; messages: readonly { content: string }[] }): string {
  const c = tokenEstimateBoardCard(input);
  return `system_len=${c.systemLen} messages=${c.messageCount} chars=${c.totalChars} tokens=${c.estimatedTokens}`;
}

/** L3 — parse status. */
export function parseTokenEstimateStatusLine(line: string): {
  readonly systemLen: number;
  readonly messages: number;
  readonly chars: number;
  readonly tokens: number;
} | null {
  const m = line.trim().match(/^system_len=(\d+) messages=(\d+) chars=(\d+) tokens=(\d+)$/);
  if (!m) return null;
  return {
    systemLen: Number(m[1]),
    messages: Number(m[2]),
    chars: Number(m[3]),
    tokens: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function tokenEstimateStatusLineMatches(input: { system?: string; messages: readonly { content: string }[] }): boolean {
  const p = parseTokenEstimateStatusLine(tokenEstimateStatusLine(input));
  if (!p) return false;
  const c = tokenEstimateBoardCard(input);
  return p.systemLen === c.systemLen && p.messages === c.messageCount && p.chars === c.totalChars && p.tokens === c.estimatedTokens;
}

/** L3 — empty chars → zero tokens; tokens ≈ ceil(chars/3). */
export function tokenEstimateStatusLineConsistent(line: string): boolean {
  const p = parseTokenEstimateStatusLine(line);
  if (!p) return false;
  if (p.chars === 0) return p.tokens === 0;
  return p.tokens === Math.ceil(p.chars / 3);
}

/** L3 — export header. */
export function tokenEstimateExportHeader(): string {
  return 'system_len,messages,chars,tokens';
}

/** L3 — export line. */
export function tokenEstimateExportLine(input: { system?: string; messages: readonly { content: string }[] }): string {
  const c = tokenEstimateBoardCard(input);
  return `${c.systemLen},${c.messageCount},${c.totalChars},${c.estimatedTokens}`;
}

/** L3 — full export. */
export function tokenEstimateExportText(input: { system?: string; messages: readonly { content: string }[] }): string {
  return [tokenEstimateExportHeader(), tokenEstimateExportLine(input)].join('\n');
}

/** L3 — empty input never invents tokens. */
export function emptyInputEstimatesZero(): boolean {
  return estimateInputTokensFromText(undefined, []) === 0;
}
