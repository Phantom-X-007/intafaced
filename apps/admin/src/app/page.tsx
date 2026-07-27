import { KillSwitchBoard } from '@/components/kill-switch-board';
import { readOperatorEnv } from '@/lib/operator-env';

export default function KillSwitchesPage() {
  const env = readOperatorEnv();
  return <KillSwitchBoard drop={env.drop} flagEnv={env.flagEnv} />;
}
