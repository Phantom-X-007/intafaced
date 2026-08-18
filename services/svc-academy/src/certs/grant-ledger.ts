/**
 * Cert grant money + rank-graph door (TRK-academy.certs).
 *
 * Spec §1.5 / §3: the grant itself does not post ledger money. XP enters the
 * one identity rank graph (`intafaced.identity.xp.earned` / bus `xpEarned`).
 * Academy never writes `rank_state`, never publishes `rankUpdated`, and never
 * invents cosmetic perks that claim a fee/IFC unlock.
 *
 * A spy on a non-existent ledger client would stay green after someone imports
 * recipes here. Callers that own a post port still go through
 * `decideCertGrantLedgerPost`, which never calls it.
 */

export const CERT_GRANT_LEDGER_REFUSE_CODE = 'academy.cert_grant_ledger_refuse_closed' as const;

export const CERT_XP_IDENTITY_GRAPH_EVENT = 'xpEarned' as const;

export const CERT_GRANT_LEDGER_RESIDUAL =
  'TRK-academy.certs — cert grant posts no ledger; XP via svc-identity rank graph only; no fake perks';

/** Keys that mean a ledger post, a second money book, or an academy rank silo. */
export const CERT_GRANT_LEDGER_BANNED_KEYS = [
  'ledgerTxId',
  'ledgerEntryId',
  'ledgerBalance',
  'PostRequest',
  'EntryInput',
  'recipes',
  'recipe',
  'ifcAmount',
  'prizePool',
  'certFee',
  'rank_state',
  'rankState',
  'localRank',
  'academyRank',
  'awardXpLocal',
] as const;

/** Cosmetic / invented perk claims that are not svc-identity rank_thresholds.perks. */
export const CERT_FAKE_PERK_BANNED_KEYS = ['fakePerk', 'cosmeticPerk', 'claimedPerks', 'inventedPerks', 'unlockedPerks'] as const;

export type CertGrantLedgerPostPort = {
  post: (body: unknown) => unknown | Promise<unknown>;
};

export type CertGrantLedgerRefuse = {
  readonly ok: false;
  readonly code: typeof CERT_GRANT_LEDGER_REFUSE_CODE;
  readonly ledgerPosted: false;
  readonly rankWriter: 'svc-identity';
  readonly xpGraph: 'intafaced.identity.xp.earned';
  readonly academyWritesRankState: false;
  readonly residual: typeof CERT_GRANT_LEDGER_RESIDUAL;
};

const LEDGER_MESSAGE =
  'Cert grant does not post ledger money — XP only via intafaced.identity.xp.earned (svc-identity rank graph); refuse-closed';

const FAKE_PERK_MESSAGE = 'Fake / cosmetic cert perks are refuse-closed — perks come only from svc-identity rank after XP; no invent';

const LOCAL_RANK_MESSAGE = 'Academy does not write rank_state — XP publishes xpEarned for svc-identity only; refuse-closed';

function refuseError(message: string): Error {
  return Object.assign(new Error(message), { code: CERT_GRANT_LEDGER_REFUSE_CODE });
}

function objectKeys(payload: unknown): string[] {
  if (payload == null || typeof payload !== 'object') return [];
  return Object.keys(payload as Record<string, unknown>);
}

/**
 * Always refuse a ledger post on the cert-grant path. The port is accepted so a
 * future wiring cannot "succeed" by posting — this function never calls `post`.
 */
export function decideCertGrantLedgerPost(
  _grant: unknown,
  opts: { readonly ledger?: CertGrantLedgerPostPort } = {},
): CertGrantLedgerRefuse {
  void _grant;
  void opts.ledger;
  return {
    ok: false,
    code: CERT_GRANT_LEDGER_REFUSE_CODE,
    ledgerPosted: false,
    rankWriter: 'svc-identity',
    xpGraph: 'intafaced.identity.xp.earned',
    academyWritesRankState: false,
    residual: CERT_GRANT_LEDGER_RESIDUAL,
  };
}

/** True when a bus event name is the identity rank XP graph (not rankUpdated). */
export function isIdentityRankXpEvent(event: string): event is typeof CERT_XP_IDENTITY_GRAPH_EVENT {
  return event === CERT_XP_IDENTITY_GRAPH_EVENT;
}

/** True when the event would be an academy-local rank write. */
export function isAcademyLocalRankWrite(event: string): boolean {
  return event === 'rankUpdated' || event === 'rank_state' || event === 'awardXpLocal';
}

/**
 * Cert XP may publish only `xpEarned`. `rankUpdated` is identity's own write
 * after it consumes XP — academy publishing it would be a second rank graph.
 */
export function assertMayPublishCertXpOnIdentityGraph(event: string): void {
  if (isAcademyLocalRankWrite(event) || !isIdentityRankXpEvent(event)) {
    throw refuseError(LOCAL_RANK_MESSAGE);
  }
}

export function assertCertGrantNeverPostsLedger(payload: unknown): void {
  const o = payload == null || typeof payload !== 'object' ? null : (payload as Record<string, unknown>);
  if (!o) return;
  for (const key of CERT_GRANT_LEDGER_BANNED_KEYS) {
    if (key in o && o[key] != null) {
      throw refuseError(LEDGER_MESSAGE);
    }
  }
}

export function assertNoFakeCertPerks(payload: unknown): void {
  const o = payload == null || typeof payload !== 'object' ? null : (payload as Record<string, unknown>);
  if (!o) return;
  for (const key of CERT_FAKE_PERK_BANNED_KEYS) {
    if (key in o && o[key] != null) {
      throw refuseError(FAKE_PERK_MESSAGE);
    }
  }
}

/** Grant-path honesty: no ledger post fields, no fake perks, no local rank silo. */
export function assertCertGrantPathHonest(payload: unknown): void {
  assertCertGrantNeverPostsLedger(payload);
  assertNoFakeCertPerks(payload);
  const keys = objectKeys(payload);
  if (keys.includes('rankUpdated') || keys.includes('rank_state')) {
    throw refuseError(LOCAL_RANK_MESSAGE);
  }
}

export function certGrantLedgerStatusLine(): string {
  return `grantLedger=0 xpGraph=${CERT_XP_IDENTITY_GRAPH_EVENT} rankWriter=svc-identity fakePerk=0 code=${CERT_GRANT_LEDGER_REFUSE_CODE}`;
}

export function isCertGrantLedgerRefuseClosed(decision: CertGrantLedgerRefuse): boolean {
  return (
    decision.ok === false &&
    decision.code === CERT_GRANT_LEDGER_REFUSE_CODE &&
    decision.ledgerPosted === false &&
    decision.academyWritesRankState === false
  );
}
