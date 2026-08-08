/**
 * Deployment registry (S-A13) — tracked artefact: addresses + chain + sourceHash.
 * Explorer verification URLs are optional until Nitro funds a public chain.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const DeploymentEntrySchema = z.object({
  name: z.string().min(1),
  address: Address,
  sourceHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  suite: z.string().min(1),
  explorerUrl: z.string().url().optional(),
  verified: z.boolean().default(false),
});

export const DeploymentRegistrySchema = z.object({
  chainId: z.number().int().positive(),
  chainName: z.string().min(1),
  rpcNote: z.string().optional(),
  deployedAt: z.string().datetime().optional(),
  contracts: z.array(DeploymentEntrySchema).min(1),
});

export type DeploymentRegistry = z.infer<typeof DeploymentRegistrySchema>;

export function parseDeploymentRegistry(json: unknown): DeploymentRegistry {
  return DeploymentRegistrySchema.parse(json);
}

export function loadDeploymentRegistry(path: string): DeploymentRegistry {
  return parseDeploymentRegistry(JSON.parse(readFileSync(path, 'utf8')));
}

/** Example artefact path shipped for schema + CI parse check. */
export function exampleRegistryPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '../../deployments/dev-anvil.example.json');
}
