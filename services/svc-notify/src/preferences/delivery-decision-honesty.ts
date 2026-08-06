/**
 * Notify L3 — pure delivery decision honesty boards (no send I/O).
 *
 * Shapes mirror combined.ts DeliveryDecision. Never invents delivery.
 */

export type DeliveryDecisionInput =
  | { readonly action: 'send_now'; readonly channel: string }
  | { readonly action: 'hold_digest'; readonly channel: string }
  | { readonly action: 'skip_muted'; readonly channel: string }
  | { readonly action: 'inapp_only' };

/** L3 — action histogram. */
export function deliveryActionHistogram(
  decisions: readonly DeliveryDecisionInput[],
): Readonly<Record<string, number>> {
  const out: Record<string, number> = {
    send_now: 0,
    hold_digest: 0,
    skip_muted: 0,
    inapp_only: 0,
  };
  for (const d of decisions) out[d.action] = (out[d.action] ?? 0) + 1;
  return out;
}

/** L3 — board card. */
export function deliveryDecisionBoardCard(decisions: readonly DeliveryDecisionInput[]): {
  readonly decisions: number;
  readonly sendNow: number;
  readonly holdDigest: number;
  readonly skipMuted: number;
  readonly inappOnly: number;
} {
  const h = deliveryActionHistogram(decisions);
  return {
    decisions: decisions.length,
    sendNow: h.send_now ?? 0,
    holdDigest: h.hold_digest ?? 0,
    skipMuted: h.skip_muted ?? 0,
    inappOnly: h.inapp_only ?? 0,
  };
}

/** L3 — status line. */
export function deliveryDecisionStatusLine(decisions: readonly DeliveryDecisionInput[]): string {
  const c = deliveryDecisionBoardCard(decisions);
  return `decisions=${c.decisions} send_now=${c.sendNow} hold_digest=${c.holdDigest} skip_muted=${c.skipMuted} inapp_only=${c.inappOnly}`;
}

/** L3 — parse status. */
export function parseDeliveryDecisionStatusLine(line: string): {
  readonly decisions: number;
  readonly sendNow: number;
  readonly holdDigest: number;
  readonly skipMuted: number;
  readonly inappOnly: number;
} | null {
  const m = line
    .trim()
    .match(
      /^decisions=(\d+) send_now=(\d+) hold_digest=(\d+) skip_muted=(\d+) inapp_only=(\d+)$/,
    );
  if (!m) return null;
  return {
    decisions: Number(m[1]),
    sendNow: Number(m[2]),
    holdDigest: Number(m[3]),
    skipMuted: Number(m[4]),
    inappOnly: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function deliveryDecisionStatusLineMatches(
  decisions: readonly DeliveryDecisionInput[],
): boolean {
  const p = parseDeliveryDecisionStatusLine(deliveryDecisionStatusLine(decisions));
  if (!p) return false;
  const c = deliveryDecisionBoardCard(decisions);
  return (
    p.decisions === c.decisions &&
    p.sendNow === c.sendNow &&
    p.holdDigest === c.holdDigest &&
    p.skipMuted === c.skipMuted &&
    p.inappOnly === c.inappOnly
  );
}

/** L3 — action parts sum to decisions. */
export function deliveryDecisionStatusLineConsistent(line: string): boolean {
  const p = parseDeliveryDecisionStatusLine(line);
  if (!p) return false;
  return p.decisions === p.sendNow + p.holdDigest + p.skipMuted + p.inappOnly;
}

/** L3 — export header. */
export function deliveryDecisionExportHeader(): string {
  return 'decisions,send_now,hold_digest,skip_muted,inapp_only';
}

/** L3 — export line. */
export function deliveryDecisionExportLine(decisions: readonly DeliveryDecisionInput[]): string {
  const c = deliveryDecisionBoardCard(decisions);
  return `${c.decisions},${c.sendNow},${c.holdDigest},${c.skipMuted},${c.inappOnly}`;
}

/** L3 — full export. */
export function deliveryDecisionExportText(decisions: readonly DeliveryDecisionInput[]): string {
  return [deliveryDecisionExportHeader(), deliveryDecisionExportLine(decisions)].join('\n');
}

/** L3 — true when no muted skips. */
export function deliveryHasNoMutedSkips(decisions: readonly DeliveryDecisionInput[]): boolean {
  return (deliveryActionHistogram(decisions).skip_muted ?? 0) === 0;
}

/** L3 — count in range. */
export function deliveryDecisionCountInRange(
  decisions: readonly DeliveryDecisionInput[],
  min: number,
  max: number,
): boolean {
  if (min > max) return false;
  const n = decisions.length;
  return n >= min && n <= max;
}
