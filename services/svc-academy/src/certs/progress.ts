/**
 * Certifications Stage-1 — progress spine (no XP emit, no perks, no ledger).
 *
 * Spec: docs/ops/trk/academy.certs.md Stage 1.
 *
 * · Schema pure functions + in-memory store shape for enroll / complete / grant.
 * · Re-complete is idempotent (no-op, not double grant).
 * · Incomplete item set cannot grant cert.
 * · Stage-2 owns XP event + perk unlock (identity rank).
 */

export type EnrollmentRecord = {
  userId: string;
  pathSlug: string;
  enrolledAt: Date;
};

export type ItemCompletionRecord = {
  userId: string;
  itemSlug: string;
  completedAt: Date;
};

export type CertDefinition = {
  /** Stable cert id, e.g. foundations-v1 */
  id: string;
  title: string;
  /** Curriculum item slugs required (all must be complete). */
  requiredItemSlugs: readonly string[];
};

export type CertGrantRecord = {
  userId: string;
  certId: string;
  grantedAt: Date;
  /** Idempotency key — same user+cert always same key Stage-1. */
  idempotencyKey: string;
};

export type CertErrorCode = 'academy.cert_not_found' | 'academy.cert_incomplete' | 'academy.cert_invalid' | 'academy.cert_already_granted';

export class CertError extends Error {
  constructor(
    message: string,
    readonly code: CertErrorCode,
  ) {
    super(message);
    this.name = 'CertError';
  }
}

export function certIdempotencyKey(userId: string, certId: string): string {
  return `cert:${userId}:${certId}`;
}

/** Pure: whether all required items appear in completed set. */
export function isComplete(required: readonly string[], completedSlugs: ReadonlySet<string>): boolean {
  return required.every((s) => completedSlugs.has(s));
}

/**
 * Grant decision: returns grant or throws. Re-grant with same key is returned
 * as alreadyGranted=true without inventing a second record.
 */
export function decideGrant(input: {
  userId: string;
  cert: CertDefinition | null;
  completedSlugs: ReadonlySet<string>;
  existing: CertGrantRecord | null;
  now?: Date;
}): { grant: CertGrantRecord; alreadyGranted: boolean } {
  const { userId, cert, completedSlugs, existing } = input;
  if (!cert) {
    throw new CertError('Unknown certification', 'academy.cert_not_found');
  }
  if (cert.requiredItemSlugs.length === 0) {
    throw new CertError('Cert definition has no required items', 'academy.cert_invalid');
  }
  if (existing) {
    return { grant: existing, alreadyGranted: true };
  }
  if (!isComplete(cert.requiredItemSlugs, completedSlugs)) {
    throw new CertError('Required curriculum items incomplete', 'academy.cert_incomplete');
  }
  const now = input.now ?? new Date();
  return {
    alreadyGranted: false,
    grant: {
      userId,
      certId: cert.id,
      grantedAt: now,
      idempotencyKey: certIdempotencyKey(userId, cert.id),
    },
  };
}

/** Pure: mark item complete; re-complete returns same timestamp (idempotent). */
export function decideItemComplete(input: { userId: string; itemSlug: string; existing: ItemCompletionRecord | null; now?: Date }): {
  record: ItemCompletionRecord;
  alreadyComplete: boolean;
} {
  const slug = input.itemSlug.trim();
  if (!slug || slug.length > 120) {
    throw new CertError('Invalid item slug', 'academy.cert_invalid');
  }
  if (input.existing) {
    return { record: input.existing, alreadyComplete: true };
  }
  return {
    alreadyComplete: false,
    record: {
      userId: input.userId,
      itemSlug: slug,
      completedAt: input.now ?? new Date(),
    },
  };
}

/** In-memory Stage-1 store for tests and early API. */
export class MemoryCertStore {
  private enrollments = new Map<string, EnrollmentRecord>();
  private completions = new Map<string, ItemCompletionRecord>();
  private grants = new Map<string, CertGrantRecord>();
  private certs = new Map<string, CertDefinition>();

  registerCert(def: CertDefinition): void {
    if (!def.id || def.requiredItemSlugs.length === 0) {
      throw new CertError('Invalid cert definition', 'academy.cert_invalid');
    }
    this.certs.set(def.id, def);
  }

  enroll(userId: string, pathSlug: string, now = new Date()): EnrollmentRecord {
    const key = `${userId}:${pathSlug}`;
    const existing = this.enrollments.get(key);
    if (existing) return existing;
    const row: EnrollmentRecord = { userId, pathSlug, enrolledAt: now };
    this.enrollments.set(key, row);
    return row;
  }

  markComplete(userId: string, itemSlug: string, now = new Date()): ItemCompletionRecord {
    const key = `${userId}:${itemSlug}`;
    const { record, alreadyComplete } = decideItemComplete({
      userId,
      itemSlug,
      existing: this.completions.get(key) ?? null,
      now,
    });
    if (!alreadyComplete) this.completions.set(key, record);
    return record;
  }

  completedSet(userId: string): Set<string> {
    const out = new Set<string>();
    for (const c of this.completions.values()) {
      if (c.userId === userId) out.add(c.itemSlug);
    }
    return out;
  }

  grant(userId: string, certId: string, now = new Date()): CertGrantRecord {
    const key = certIdempotencyKey(userId, certId);
    const { grant } = decideGrant({
      userId,
      cert: this.certs.get(certId) ?? null,
      completedSlugs: this.completedSet(userId),
      existing: this.grants.get(key) ?? null,
      now,
    });
    this.grants.set(key, grant);
    return grant;
  }

  listCerts(userId: string): CertGrantRecord[] {
    return [...this.grants.values()].filter((g) => g.userId === userId);
  }
}
