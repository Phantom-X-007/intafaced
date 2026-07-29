/**
 * THE RESULT TYPE — the reason this terminal cannot lie.
 *
 * Every call to a service returns one of these. There is no third state where a
 * component holds a value it did not get, and no path where a thrown error is
 * swallowed into an empty array that renders as "no open orders" when the truth
 * is "we could not ask".
 *
 * That distinction is the whole point. A trader who sees an empty blotter
 * believes they have no positions. A trader who sees "svc-trade unreachable"
 * goes and looks. The type system is what keeps those two apart: a `Result`
 * cannot be read without deciding which one it is.
 */

/** Which service the call was addressed to, as the edge route table names it. */
export type ServiceId = 'identity' | 'trade' | 'token' | 'agents' | 'bank' | 'p2p' | 'pay' | 'blueprint' | 'protocol';

export type FailureReason =
  /** No answer at all — DNS, connection refused, timeout, CORS. */
  | 'unreachable'
  /** The service answered: you are not logged in, or the token expired. */
  | 'unauthenticated'
  /** The service answered: logged in, and this credential may never do this. */
  | 'forbidden'
  /**
   * The service answered: you hold the authority and are short of verification.
   *
   * Split out of `forbidden` because it is the only refusal on this list that
   * the user can clear themselves. Both arrive as HTTP 403, and only the
   * service's `intafacedCode` tells them apart — while it did not, the best
   * this terminal could say was "scope, verification tier or jurisdiction",
   * which sends someone who needs to press "verify" to support instead.
   */
  | 'needs-verification'
  | 'not-found'
  /** The service answered and refused the request on its merits. */
  | 'rejected'
  /** The service answered, and the answer was not the shape the contract promises. */
  | 'invalid-response'
  | 'server-error';

/** Verification tiers, as the jurisdiction matrix names them. */
export type RequiredTier = 'none' | 'basic' | 'full' | 'institutional';

export interface Failure {
  readonly ok: false;
  readonly reason: FailureReason;
  /** Safe to render. Never contains a token. */
  readonly message: string;
  readonly service: ServiceId;
  /** tRPC procedure path, e.g. `markets.list`. */
  readonly path: string;
  /** Only on `needs-verification` — the tier that would clear the refusal. */
  readonly requiredTier?: RequiredTier;
}

export type Result<T> = { readonly ok: true; readonly value: T } | Failure;

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function failure(service: ServiceId, path: string, reason: FailureReason, message: string, requiredTier?: RequiredTier): Failure {
  return { ok: false, reason, message, service, path, ...(requiredTier ? { requiredTier } : {}) };
}

/**
 * One line an operator — or a user — can act on.
 *
 * Deliberately names the service. "Something went wrong" is the message that
 * makes a support ticket take three days.
 */
export function describeFailure(f: Failure): string {
  switch (f.reason) {
    case 'unreachable':
      return `svc-${f.service} is unreachable through the edge`;
    case 'unauthenticated':
      return 'Sign in to load this';
    case 'forbidden':
      return f.message || `svc-${f.service} refused this account`;
    case 'needs-verification':
      // The one refusal that names a next step. The tier comes from the
      // jurisdiction matrix, so this says "full" for a bank space and "basic"
      // for a P2P offer without the client knowing either rule.
      return f.requiredTier ? `Verification tier "${f.requiredTier}" is required for this` : 'This needs identity verification';
    case 'not-found':
      return f.message || `svc-${f.service} has no ${f.path}`;
    case 'invalid-response':
      return `svc-${f.service} answered ${f.path} in a shape this client does not recognise`;
    case 'rejected':
      return f.message;
    case 'server-error':
      return `svc-${f.service} failed on ${f.path}`;
  }
}
