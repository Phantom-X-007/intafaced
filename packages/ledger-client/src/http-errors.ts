import { InsufficientFundsError } from './types.js';

/**
 * Map svc-ledger HTTP error bodies back to typed ledger errors.
 *
 * Production service clients used to `throw new Error(text)`, which dropped
 * `instanceof InsufficientFundsError` and broke fail-closed void paths (P2P-01).
 * s2s-http now emits structured `code` + amount fields when possible.
 */
export function rehydrateLedgerHttpError(path: string, status: number, detail: string): Error {
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(detail) as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  const code = typeof parsed?.code === 'string' ? parsed.code : null;
  const message = typeof parsed?.message === 'string' ? parsed.message : detail;
  const blob = `${code ?? ''} ${message} ${detail}`;

  if (status === 400 && (code === 'ledger.insufficient_funds' || /insufficient_funds|Insufficient \w+:/.test(blob))) {
    const assetId = typeof parsed?.assetId === 'string' ? parsed.assetId : 'UNKNOWN';
    const accountId = typeof parsed?.accountId === 'string' ? parsed.accountId : 'unknown';
    const requested = typeof parsed?.requested === 'string' ? parsed.requested : '0';
    const availableBalance = typeof parsed?.availableBalance === 'string' ? parsed.availableBalance : '0';
    const fromMsg = message.match(/Insufficient (\S+): requested (\S+), available (\S+)/);
    return new InsufficientFundsError(
      accountId,
      fromMsg?.[1] ?? assetId,
      (fromMsg?.[2] ?? requested) as `${string}`,
      (fromMsg?.[3] ?? availableBalance) as `${string}`,
    );
  }

  return new Error(`svc-ledger ${path} failed (${status}): ${detail}`);
}
