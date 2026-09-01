import type { InvokeResponse } from '@/lib/operator-tools-browser';

export const KYC_QUEUE_TOOL_ID = 'identity.kyc.pending';

export type KycTier = 'none' | 'basic' | 'full' | 'institutional';

export interface KycQueueRow {
  readonly id: string;
  readonly userId: string;
  readonly tier: KycTier;
  readonly jurisdiction: string;
  readonly status: 'pending';
  readonly reviewedAt: null;
  readonly expiresAt: string | null;
  readonly createdAt: string;
}

export type QueueFailureKind = 'refused' | 'unauthorized' | 'malformed' | 'unreachable';

export type KycQueueSnapshot =
  | { readonly kind: 'loading'; readonly requestedLimit: number }
  | {
      readonly kind: 'unavailable';
      readonly reason: string;
      readonly missing: readonly string[];
      readonly requestedLimit: number;
    }
  | {
      readonly kind: 'failure';
      readonly failure: QueueFailureKind;
      readonly detail: string;
      readonly requestedLimit: number;
      readonly receivedAt: string;
    }
  | {
      readonly kind: 'empty' | 'live' | 'partial';
      readonly rows: readonly KycQueueRow[];
      readonly rejectedRows: number;
      readonly requestedLimit: number;
      readonly receivedAt: string;
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIERS = new Set<KycTier>(['none', 'basic', 'full', 'institutional']);

function iso(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function parseKycQueueRow(value: unknown): KycQueueRow | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || !UUID.test(row.id)) return null;
  if (typeof row.userId !== 'string' || !UUID.test(row.userId)) return null;
  if (typeof row.tier !== 'string' || !TIERS.has(row.tier as KycTier)) return null;
  if (typeof row.jurisdiction !== 'string' || !/^[A-Z]{2}$/.test(row.jurisdiction)) return null;
  if (row.status !== 'pending' || row.reviewedAt !== null) return null;
  if (row.expiresAt !== null && !iso(row.expiresAt)) return null;
  if (!iso(row.createdAt)) return null;
  return row as unknown as KycQueueRow;
}

export function snapshotFromKycResponse(result: InvokeResponse, requestedLimit: number, receivedAt = new Date()): KycQueueSnapshot {
  const receivedAtIso = receivedAt.toISOString();
  if (!result.ok || !result.delivered) {
    const failure: QueueFailureKind =
      result.status === 401 || result.status === 403
        ? 'unauthorized'
        : result.status === 502 || result.status === 504 || (result.delivered && result.status >= 500)
          ? 'unreachable'
          : 'refused';
    return {
      kind: 'failure',
      failure,
      detail: result.detail ?? `Queue request answered HTTP ${result.status}`,
      requestedLimit,
      receivedAt: receivedAtIso,
    };
  }
  if (!Array.isArray(result.data)) {
    return {
      kind: 'failure',
      failure: 'malformed',
      detail: 'identity.kyc.pending returned a non-array response',
      requestedLimit,
      receivedAt: receivedAtIso,
    };
  }

  const rows = result.data.map(parseKycQueueRow).filter((row): row is KycQueueRow => row != null);
  const rejectedRows = result.data.length - rows.length;
  if (rejectedRows > 0 && rows.length === 0) {
    return {
      kind: 'failure',
      failure: 'malformed',
      detail: `identity.kyc.pending returned ${rejectedRows} malformed row${rejectedRows === 1 ? '' : 's'}`,
      requestedLimit,
      receivedAt: receivedAtIso,
    };
  }
  return {
    kind: rejectedRows > 0 ? 'partial' : rows.length === 0 ? 'empty' : 'live',
    rows,
    rejectedRows,
    requestedLimit,
    receivedAt: receivedAtIso,
  };
}

export function maskUserId(userId: string): string {
  return `${userId.slice(0, 8)}…${userId.slice(-4)}`;
}

export function queueAgeSeconds(receivedAt: string, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(receivedAt)) / 1_000));
}

export function isQueueStale(receivedAt: string, now = new Date()): boolean {
  return queueAgeSeconds(receivedAt, now) >= 60;
}
