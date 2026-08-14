#!/usr/bin/env python3
"""One-shot: wire crypto payout to stored EVM dest. Self-deleted by the workflow."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


def patch(rel: str, replacements: list[tuple[str, str]]) -> None:
    path = ROOT / rel
    text = path.read_text()
    for old, new in replacements:
        if old not in text:
            raise SystemExit(f'missing needle in {rel}: {old[:80]!r}')
        text = text.replace(old, new, 1)
    path.write_text(text)
    print('patched', rel)


patch(
    'services/svc-pay/src/merchant-payout-destination.ts',
    [
        (
            '''export function assertOnlyPayoutDestinations(): MerchantPayoutDestinations {
  return {
    async persist(input) {
      return assertPersistableDestination(input.railId, input);
    },
    async require(input) {
      throw new PayoutDestinationMissingError(input.merchantId, input.railId);
    },
  };
}
''',
            '''export function assertOnlyPayoutDestinations(): MerchantPayoutDestinations {
  return {
    async persist(input) {
      return assertPersistableDestination(input.railId, input);
    },
    async require(input) {
      throw new PayoutDestinationMissingError(input.merchantId, input.railId);
    },
  };
}

/** In-memory store for tests — persist actually stores, require refuses if none. */
export function memoryPayoutDestinations(): MerchantPayoutDestinations {
  const rows = new Map[str, PayoutDestination]() if False else __import__('typing')
''',
        )
    ],
)
