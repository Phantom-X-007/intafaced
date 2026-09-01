import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type QuantLibPin = {
  readonly job: string;
  readonly take: string;
  readonly repo: string;
  readonly version: string;
  readonly tag: string;
  readonly released: string;
  readonly commit: string;
  readonly url: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly role: string;
  readonly keepInRepo: readonly string[];
  readonly never: readonly string[];
};

/** North-star §0.3 pin: lballabio/QuantLib 1.43, commit SHA, adapter-only. */
export const QUANTLIB_PIN_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'QUANTLIB.pin.json');

export function readQuantLibPin(): QuantLibPin {
  const raw: unknown = JSON.parse(readFileSync(QUANTLIB_PIN_PATH, 'utf8'));
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('QUANTLIB.pin.json is not an object');
  }
  return raw as QuantLibPin;
}
