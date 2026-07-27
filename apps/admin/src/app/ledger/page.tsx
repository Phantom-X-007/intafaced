import { LedgerOps } from '@/components/ledger-ops';
import { readOperatorEnv } from '@/lib/operator-env';

export default function LedgerOpsPage() {
  const env = readOperatorEnv();
  return <LedgerOps drop={env.drop} flagEnv={env.flagEnv} />;
}
