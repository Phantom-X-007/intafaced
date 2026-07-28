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
  /** The service answered: logged in, but scope / KYC tier / jurisdiction says no. */
  | 'forbidden'
  | 'not-found'
  /** The service answered and refused the request on its merits. */
  | 'rejected'
  /** The service answered, and the answer was not the shape the contract promises. */
  | 'invalid-response'
  | 'server-error';

export interface Failure {
  readonly ok: false;
  readonly reason: FailureReason;
  /** Safe to render. Never contains a token. */
  readonly message: string;
  readonly service: ServiceId;
  /** tRPC procedure path, e.g. `markets.list`. */
  readonly path: string;
}

export type Result<T> = { readonly ok: true; readonly value: T } | Failure;

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function failure(service: ServiceId, path: string, reason: FailureReason, message: string): Failure {
  return { ok: false, reason, message, service, path };
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
      return f.message || `svc-${f.service} refused: scope, verification tier or jurisdiction`;
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
