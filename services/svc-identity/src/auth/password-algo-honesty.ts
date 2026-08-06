/**
 * Identity L3 — pure password algorithm catalog honesty (no hash I/O).
 *
 * Mirrors passwords.ts Algorithm + prod rule: argon2id required in prod.
 * Does not invent hashes or cost params beyond declared catalog facts.
 */

export const PASSWORD_ALGORITHMS = ['argon2id', 'scrypt'] as const;
export type PasswordAlgorithmId = (typeof PASSWORD_ALGORITHMS)[number];

export const PASSWORD_PROD_REQUIRED_ALGO: PasswordAlgorithmId = 'argon2id';
export const PASSWORD_DEV_FALLBACK_ALGO: PasswordAlgorithmId = 'scrypt';

/** L3 — catalog board. */
export function passwordAlgoCatalogBoardCard(): {
  readonly algorithms: number;
  readonly prodRequired: string;
  readonly devFallback: string;
  readonly fastHashAllowed: number;
} {
  return {
    algorithms: PASSWORD_ALGORITHMS.length,
    prodRequired: PASSWORD_PROD_REQUIRED_ALGO,
    devFallback: PASSWORD_DEV_FALLBACK_ALGO,
    fastHashAllowed: 0,
  };
}

/** L3 — status line. */
export function passwordAlgoCatalogStatusLine(): string {
  const c = passwordAlgoCatalogBoardCard();
  return `algorithms=${c.algorithms} prod=${c.prodRequired} dev_fallback=${c.devFallback} fast_hash=${c.fastHashAllowed}`;
}

/** L3 — parse status. */
export function parsePasswordAlgoCatalogStatusLine(line: string): {
  readonly algorithms: number;
  readonly prod: string;
  readonly devFallback: string;
  readonly fastHash: number;
} | null {
  const m = line
    .trim()
    .match(/^algorithms=(\d+) prod=(argon2id|scrypt) dev_fallback=(argon2id|scrypt) fast_hash=([01])$/);
  if (!m) return null;
  return {
    algorithms: Number(m[1]),
    prod: m[2]!,
    devFallback: m[3]!,
    fastHash: Number(m[4]),
  };
}

/** L3 — true when status matches. */
export function passwordAlgoCatalogStatusLineMatches(): boolean {
  const p = parsePasswordAlgoCatalogStatusLine(passwordAlgoCatalogStatusLine());
  if (!p) return false;
  const c = passwordAlgoCatalogBoardCard();
  return (
    p.algorithms === c.algorithms &&
    p.prod === c.prodRequired &&
    p.devFallback === c.devFallback &&
    p.fastHash === c.fastHashAllowed
  );
}

/** L3 — no fast hash; prod is argon2id. */
export function passwordAlgoCatalogStatusLineConsistent(line: string): boolean {
  const p = parsePasswordAlgoCatalogStatusLine(line);
  if (!p) return false;
  return p.fastHash === 0 && p.prod === 'argon2id' && p.algorithms === 2;
}

/** L3 — export header. */
export function passwordAlgoCatalogExportHeader(): string {
  return 'algorithms,prod,dev_fallback,fast_hash';
}

/** L3 — export line. */
export function passwordAlgoCatalogExportLine(): string {
  const c = passwordAlgoCatalogBoardCard();
  return `${c.algorithms},${c.prodRequired},${c.devFallback},${c.fastHashAllowed}`;
}

/** L3 — full export. */
export function passwordAlgoCatalogExportText(): string {
  return [passwordAlgoCatalogExportHeader(), passwordAlgoCatalogExportLine()].join('\n');
}

/** L3 — algorithm declared. */
export function isDeclaredPasswordAlgorithm(algo: string): boolean {
  return (PASSWORD_ALGORITHMS as readonly string[]).includes(algo);
}

/** L3 — true when algo is prod-required. */
export function isProdRequiredPasswordAlgorithm(algo: string): boolean {
  return algo === PASSWORD_PROD_REQUIRED_ALGO;
}
