/**
 * Identity L3 — pure TOTP policy catalog honesty boards (no crypto I/O).
 *
 * Structural defaults mirror totp.ts RFC 6238 defaults. Does not invent secrets.
 */

export const TOTP_DEFAULT_STEP_SECONDS = 30;
export const TOTP_DEFAULT_DIGITS = 6;
export const TOTP_ALGORITHMS = ['sha1', 'sha256', 'sha512'] as const;

export type TotpPolicyInput = {
  readonly step: number;
  readonly digits: number;
  readonly algorithm: (typeof TOTP_ALGORITHMS)[number];
};

/** L3 — default policy. */
export function defaultTotpPolicy(): TotpPolicyInput {
  return {
    step: TOTP_DEFAULT_STEP_SECONDS,
    digits: TOTP_DEFAULT_DIGITS,
    algorithm: 'sha1',
  };
}

/** L3 — true when policy matches RFC defaults used on tip. */
export function isDefaultTotpPolicy(policy: TotpPolicyInput): boolean {
  const d = defaultTotpPolicy();
  return policy.step === d.step && policy.digits === d.digits && policy.algorithm === d.algorithm;
}

/** L3 — board card. */
export function totpPolicyBoardCard(policy: TotpPolicyInput): {
  readonly step: number;
  readonly digits: number;
  readonly algorithm: string;
  readonly isDefault: number;
  readonly algorithmsCatalog: number;
} {
  return {
    step: policy.step,
    digits: policy.digits,
    algorithm: policy.algorithm,
    isDefault: isDefaultTotpPolicy(policy) ? 1 : 0,
    algorithmsCatalog: TOTP_ALGORITHMS.length,
  };
}

/** L3 — status line. */
export function totpPolicyStatusLine(policy: TotpPolicyInput): string {
  const c = totpPolicyBoardCard(policy);
  return `step=${c.step} digits=${c.digits} algorithm=${c.algorithm} default=${c.isDefault} alg_catalog=${c.algorithmsCatalog}`;
}

/** L3 — parse status. */
export function parseTotpPolicyStatusLine(line: string): {
  readonly step: number;
  readonly digits: number;
  readonly algorithm: string;
  readonly isDefault: number;
  readonly algCatalog: number;
} | null {
  const m = line
    .trim()
    .match(/^step=(\d+) digits=(\d+) algorithm=(sha1|sha256|sha512) default=([01]) alg_catalog=(\d+)$/);
  if (!m) return null;
  return {
    step: Number(m[1]),
    digits: Number(m[2]),
    algorithm: m[3]!,
    isDefault: Number(m[4]),
    algCatalog: Number(m[5]),
  };
}

/** L3 — true when status matches. */
export function totpPolicyStatusLineMatches(policy: TotpPolicyInput): boolean {
  const p = parseTotpPolicyStatusLine(totpPolicyStatusLine(policy));
  if (!p) return false;
  const c = totpPolicyBoardCard(policy);
  return (
    p.step === c.step &&
    p.digits === c.digits &&
    p.algorithm === c.algorithm &&
    p.isDefault === c.isDefault &&
    p.algCatalog === c.algorithmsCatalog
  );
}

/** L3 — step/digits positive; catalog fixed. */
export function totpPolicyStatusLineConsistent(line: string): boolean {
  const p = parseTotpPolicyStatusLine(line);
  if (!p) return false;
  return p.step > 0 && p.digits > 0 && p.algCatalog === TOTP_ALGORITHMS.length;
}

/** L3 — export header. */
export function totpPolicyExportHeader(): string {
  return 'step,digits,algorithm,default,alg_catalog';
}

/** L3 — export line. */
export function totpPolicyExportLine(policy: TotpPolicyInput): string {
  const c = totpPolicyBoardCard(policy);
  return `${c.step},${c.digits},${c.algorithm},${c.isDefault},${c.algorithmsCatalog}`;
}

/** L3 — full export. */
export function totpPolicyExportText(policy: TotpPolicyInput): string {
  return [totpPolicyExportHeader(), totpPolicyExportLine(policy)].join('\n');
}

/** L3 — algorithm declared. */
export function isDeclaredTotpAlgorithm(algo: string): boolean {
  return (TOTP_ALGORITHMS as readonly string[]).includes(algo);
}

/** L3 — digits in allowed board range (6–8 common authenticators). */
export function totpDigitsInRange(policy: TotpPolicyInput, min: number, max: number): boolean {
  if (min > max) return false;
  return policy.digits >= min && policy.digits <= max;
}
