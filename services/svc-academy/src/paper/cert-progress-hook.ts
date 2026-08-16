/**
 * Paper Stage-2 leftover — optional cert item-completion hook.
 * (TRK-academy.paper-trading → academy.certs)
 *
 * After a sealed complete paper drill, record the workbook as a cert *item*
 * via `decideItemComplete`. This path must never:
 *   · call grantCert / mint a cert
 *   · invent XP amounts
 *   · map cert → perk money
 *   · post ledger
 *
 * Unbound workbook (not in any cert's required items) → named
 * `academy.paper_cert_unbound`, not a fake grant.
 */

import { decideItemComplete, workbookCertBinding, type CertDefinition, type ItemCompletionRecord } from '../certs/progress.js';
import { isDrillComplete, type DrillRun } from './workbook-loop.js';

export type PaperCertProgressSpies = {
  readonly grantCert?: (...args: unknown[]) => unknown;
};

export type PaperCertProgressView =
  | {
      readonly simulated: true;
      readonly realMoney: false;
      readonly progress: 'incomplete';
      readonly grantCert: false;
      readonly perkMap: false;
    }
  | {
      readonly simulated: true;
      readonly realMoney: false;
      readonly progress: 'unbound';
      readonly reason: 'academy.paper_cert_unbound';
      readonly itemSlug: string;
      readonly grantCert: false;
      readonly perkMap: false;
    }
  | {
      readonly simulated: true;
      readonly realMoney: false;
      readonly progress: 'recorded';
      readonly certId: string;
      readonly itemSlug: string;
      readonly alreadyComplete: boolean;
      readonly completedAt: Date;
      readonly grantCert: false;
      readonly perkMap: false;
    };

/**
 * Call existing cert completion (`decideItemComplete`) after a sealed drill.
 * `grantCert` on spies is accepted only so tests can prove it is never invoked.
 */
export function recordPaperCertItemProgress(input: {
  readonly userId: string;
  readonly run: DrillRun;
  readonly certs: readonly CertDefinition[];
  readonly existing: ItemCompletionRecord | null;
  readonly persist?: (record: ItemCompletionRecord) => void;
  readonly spies?: PaperCertProgressSpies;
  readonly now?: Date;
}): PaperCertProgressView {
  // Intentionally unread: this hook must not mint certs.
  void input.spies?.grantCert;

  if (!isDrillComplete(input.run)) {
    return {
      simulated: true,
      realMoney: false,
      progress: 'incomplete',
      grantCert: false,
      perkMap: false,
    };
  }

  const binding = workbookCertBinding(input.run.workbookSlug, input.certs);
  if (binding.progress === 'unbound') {
    return {
      simulated: true,
      realMoney: false,
      progress: 'unbound',
      reason: binding.reason,
      itemSlug: binding.itemSlug,
      grantCert: false,
      perkMap: false,
    };
  }

  const decision = decideItemComplete({
    userId: input.userId,
    itemSlug: binding.itemSlug,
    existing: input.existing,
    now: input.now,
  });
  if (!decision.alreadyComplete) {
    input.persist?.(decision.record);
  }
  return {
    simulated: true,
    realMoney: false,
    progress: 'recorded',
    certId: binding.certId,
    itemSlug: binding.itemSlug,
    alreadyComplete: decision.alreadyComplete,
    completedAt: decision.record.completedAt,
    grantCert: false,
    perkMap: false,
  };
}
