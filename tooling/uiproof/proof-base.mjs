import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Proof URL for this worktree. Never default to :8090.
 * PORT / UIPROOF_BASE win; else ui:boot provenance.json.
 */
export function proofBase(repoRoot) {
  if (process.env.UIPROOF_BASE) return process.env.UIPROOF_BASE;
  if (process.env.PORT) return `http://127.0.0.1:${process.env.PORT}`;
  const provenancePath = join(repoRoot, '.artifacts', 'uiproof', 'provenance.json');
  if (existsSync(provenancePath)) {
    const proven = JSON.parse(readFileSync(provenancePath, 'utf8'));
    if (proven?.port) return `http://127.0.0.1:${proven.port}`;
  }
  throw new Error('No UIPROOF_BASE/PORT and no .artifacts/uiproof/provenance.json. Run pnpm ui:boot first. Default :8090 is refused.');
}
