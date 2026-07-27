import { LaunchSequence } from '@/components/launch-sequence';
import { readOperatorEnv } from '@/lib/operator-env';

export default function LaunchSequencePage() {
  const env = readOperatorEnv();
  return <LaunchSequence currentDrop={env.drop} flagEnv={env.flagEnv} />;
}
