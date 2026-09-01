import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type SbePin = {
  readonly job: string;
  readonly take: string;
  readonly repo: string;
  readonly version: string;
  readonly tag: string;
  readonly released: string;
  readonly commit: string;
  readonly url: string;
  readonly maven: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly role: string;
  readonly keepInRepo: readonly string[];
  readonly never: readonly string[];
};

/** North-star §0.3 pin: aeron-io/simple-binary-encoding 1.39.0, commit SHA, adapter-only. */
export const SBE_PIN_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'SBE.pin.json');

export function readSbePin(): SbePin {
  const raw: unknown = JSON.parse(readFileSync(SBE_PIN_PATH, 'utf8'));
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('SBE.pin.json is not an object');
  }
  return raw as SbePin;
}
