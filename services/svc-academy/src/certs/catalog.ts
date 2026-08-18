/**
 * Certification definitions Stage-1 — code-seeded catalog (no DB).
 *
 * Spec: docs/ops/trk/academy.certs.md Stage 1.
 * Required items are curriculum slugs from the platform-native spine
 * (enforced by catalog-spine.test.ts). XP policy is Stage-2 shipped for
 * priced certs only; perks stay identity rank SoT; no ledger here.
 */

import type { CertDefinition } from './progress.js';

/** Foundations path cert — all foundations curriculum items on tip. */
export const FOUNDATIONS_V1: CertDefinition = {
  id: 'foundations-v1',
  title: 'Foundations',
  requiredItemSlugs: [
    'foundations-risk-first',
    'foundations-order-types',
    'foundations-paper-workbook',
    'foundations-position-sizing',
    'foundations-journal-discipline',
    'foundations-invalidation-first',
    'foundations-fees-are-real',
  ],
};

/** All Stage-1 certs. Add only when curriculum items exist on tip. */
export const CERT_CATALOG: readonly CertDefinition[] = [FOUNDATIONS_V1];

export function certById(id: string): CertDefinition | null {
  return CERT_CATALOG.find((c) => c.id === id) ?? null;
}

export function listCertCatalog(): readonly CertDefinition[] {
  return CERT_CATALOG;
}
