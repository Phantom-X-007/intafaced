import { KillSwitchBoard } from '@/components/kill-switch-board';
import { readKillSwitches } from '@/lib/kill-switch-client';
import { readOperatorEnv } from '@/lib/operator-env';

/**
 * The live kill-switch state is read on the server, on every request (the
 * layout is `force-dynamic`). A board rendered from a cache is a board that can
 * tell an operator the platform is up while it is down.
 */
export default async function KillSwitchesPage() {
  const env = readOperatorEnv();
  const control = await readKillSwitches();

  return (
    <KillSwitchBoard
      drop={env.drop}
      flagEnv={env.flagEnv}
      controlStatus={control.status}
      controlDetail={control.detail}
      liveDisabledModules={[...control.snapshot.disabledModules]}
      liveReasons={control.snapshot.reasons}
    />
  );
}
